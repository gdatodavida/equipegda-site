// Edge Function: webhook-mercadopago
// O Mercado Pago chama esta URL quando um pagamento muda de status.
// DEPLOY OBRIGATÓRIO com --no-verify-jwt (o MP não envia token do Supabase) — a segurança é a assinatura x-signature.
import { admin, reconciliarPorMpId } from "../_shared/mp.ts";
import { validarAssinaturaMP } from "../_shared/logic.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  const secret = Deno.env.get("MP_WEBHOOK_SECRET") ?? "";
  const url = new URL(req.url);
  const raw = await req.text();
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch (_) { /* ignora */ }

  // data.id vem na query string (?data.id=123) e também no corpo.
  const dataId = url.searchParams.get("data.id") ?? (body?.data?.id != null ? String(body.data.id) : null);
  const tipo = url.searchParams.get("type") ?? body?.type ?? url.searchParams.get("topic") ?? null;

  const valido = await validarAssinaturaMP({
    secret,
    xSignature: req.headers.get("x-signature"),
    xRequestId: req.headers.get("x-request-id"),
    dataId,
  });
  if (!valido) {
    console.warn("assinatura inválida — notificação descartada");
    return new Response("assinatura invalida", { status: 401 });
  }

  // Só nos interessa o tópico "payment"; os demais são confirmados e ignorados.
  if (tipo !== "payment" || !dataId) return new Response("ok", { status: 200 });

  try {
    const r = await reconciliarPorMpId(admin(), dataId);
    // concluido=false → algo falhou (ex.: Apps Script fora do ar): 500 faz o MP reenviar depois.
    if (r && !r.concluido) return new Response("tentar novamente", { status: 500 });
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("webhook", e);
    return new Response("erro", { status: 500 });
  }
});
