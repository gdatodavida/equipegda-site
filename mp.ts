// Utilitários compartilhados (Deno / Supabase Edge Functions).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { mapearStatus } from "./logic.ts";

export const MP_API = "https://api.mercadopago.com";

export function admin(): SupabaseClient {
  // SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente pelo Supabase nas Edge Functions.
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

export function mpToken(): string {
  const t = Deno.env.get("MP_ACCESS_TOKEN");
  if (!t) throw new Error("MP_ACCESS_TOKEN não configurado nos Secrets do Supabase");
  return t;
}

// ---------- CORS ----------
const ORIGENS = (Deno.env.get("ALLOWED_ORIGINS") ??
  "https://equipegda.com.br,https://www.equipegda.com.br").split(",").map((s) => s.trim());

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const permitido = ORIGENS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": permitido ? origin : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

// ---------- Mercado Pago ----------
export async function mpGetPayment(id: string | number) {
  const r = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(String(id))}`, {
    headers: { Authorization: `Bearer ${mpToken()}` },
  });
  if (!r.ok) throw new Error(`mp_get_payment_${r.status}`);
  return await r.json();
}

// ---------- Apps Script (planilha de clientes + GDA Vendas) ----------
export async function chamarAppsScript(action: string, data: Record<string, unknown>): Promise<boolean> {
  const url = Deno.env.get("APPS_SCRIPT_URL");
  if (!url) {
    console.warn("APPS_SCRIPT_URL ausente — sincronização com a planilha pulada");
    return false;
  }
  try {
    const body: Record<string, unknown> = { action, data };
    const token = Deno.env.get("APPS_SCRIPT_TOKEN");
    if (token) body.token = token;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight no Apps Script
      body: JSON.stringify(body),
      redirect: "follow",
    });
    const txt = await r.text();
    if (!r.ok) {
      console.error("apps script http", r.status, txt.slice(0, 300));
      return false;
    }
    try {
      const j = JSON.parse(txt);
      if (j && (j.ok === false || j.success === false || j.error)) {
        console.error("apps script respondeu erro", txt.slice(0, 300));
        return false;
      }
    } catch (_) {
      // resposta não-JSON: se HTTP 200, considera entregue
    }
    return true;
  } catch (e) {
    console.error("apps script falhou", e);
    return false;
  }
}

// ---------- Reconciliação: consulta o MP e aplica os efeitos (idempotente) ----------
export type ResultadoReconciliacao = {
  status: string;
  pagamento_id?: string;
  sincronizado?: boolean;
  /** false quando algo precisa ser tentado de novo (ex.: Apps Script fora do ar) */
  concluido: boolean;
};

export async function reconciliarPorMpId(db: SupabaseClient, mpPaymentId: string | number): Promise<ResultadoReconciliacao | null> {
  const mp = await mpGetPayment(mpPaymentId);
  const ref = String(mp.external_reference ?? "");
  if (!ref) return null;

  const { data: pg } = await db.from("pagamentos").select("*").eq("id", ref).maybeSingle();
  if (!pg) {
    console.warn("pagamento sem registro local", ref);
    return null;
  }
  if (pg.mp_payment_id && String(pg.mp_payment_id) !== String(mp.id)) {
    console.warn("mp id divergente", pg.mp_payment_id, mp.id);
    return null;
  }
  if (Math.abs(Number(mp.transaction_amount) - Number(pg.valor)) > 0.009) {
    console.error("valor divergente — ignorado", mp.transaction_amount, pg.valor);
    return null;
  }

  return await aplicar(db, pg, mapearStatus(String(mp.status)));
}

export async function reconciliarPorPagamentoId(db: SupabaseClient, pagamentoId: string): Promise<ResultadoReconciliacao | null> {
  const { data: pg } = await db.from("pagamentos").select("*").eq("id", pagamentoId).maybeSingle();
  if (!pg || !pg.mp_payment_id) return null;
  return await reconciliarPorMpId(db, pg.mp_payment_id);
}

// deno-lint-ignore no-explicit-any
async function aplicar(db: SupabaseClient, pg: any, novo: string): Promise<ResultadoReconciliacao> {
  // Nunca "desaprova" um pagamento já aprovado por uma notificação atrasada de pending.
  const statusFinal = pg.status === "aprovado" && novo === "pendente" ? "aprovado" : novo;

  if (statusFinal !== pg.status) {
    const upd: Record<string, unknown> = { status: statusFinal, updated_at: new Date().toISOString() };
    if (statusFinal === "aprovado") upd.pago_em = new Date().toISOString();
    await db.from("pagamentos").update(upd).eq("id", pg.id);
  }

  if (statusFinal !== "aprovado") {
    return { status: statusFinal, pagamento_id: pg.id, concluido: true };
  }

  // ----- aprovado: efeitos idempotentes -----
  if (pg.tipo === "camisa") {
    await db.from("pedidos").update({ status: "pago" }).eq("id", pg.referencia_id).eq("status", "pendente");
    if (!pg.sincronizado) await db.from("pagamentos").update({ sincronizado: true }).eq("id", pg.id);
    return { status: "aprovado", pagamento_id: pg.id, sincronizado: true, concluido: true };
  }

  if (pg.tipo === "adesivo") {
    await db.from("cadastros").update({ adesivo_pago: true, adesivo_pago_em: new Date().toISOString() })
      .eq("id", pg.referencia_id).eq("adesivo_pago", false);

    if (pg.sincronizado) return { status: "aprovado", pagamento_id: pg.id, sincronizado: true, concluido: true };

    const { data: c } = await db.from("cadastros").select("id,nome,apelido,numero_piloto").eq("id", pg.referencia_id).maybeSingle();
    const ok = await chamarAppsScript("confirmarAdesivoPago", {
      cadastro_id: pg.referencia_id,
      numero_piloto: c?.numero_piloto ?? null,
      nome: c?.nome ?? null,
      comprovante_url: pg.ticket_url ?? null,
      payment_method: "pix",
      mp_payment_id: pg.mp_payment_id,
      valor: pg.valor,
    });
    if (ok) await db.from("pagamentos").update({ sincronizado: true }).eq("id", pg.id);
    return { status: "aprovado", pagamento_id: pg.id, sincronizado: ok, concluido: ok };
  }

  return { status: "aprovado", pagamento_id: pg.id, concluido: true };
}
