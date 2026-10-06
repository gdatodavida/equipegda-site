// Edge Function: criar-pix
// Entrada (POST JSON):
//   { "tipo": "adesivo", "cadastro_id": "<uuid>" }
//   { "tipo": "camisa",  "pedido_id": "<id do pedido>", "email": "opcional@x.com" }
// Saída: { pagamento_id, valor, status, qr_code, qr_code_base64, ticket_url, expira_em }
// O VALOR NUNCA vem do navegador: é calculado aqui a partir do banco.
import { admin, cors, json, MP_API, mpToken } from "../_shared/mp.ts";
import {
  calcularValorPedido, emailValido, expiracaoMP, montarCorpoPix, moeda, PRECO_ADESIVO, uuidValido,
} from "../_shared/logic.ts";

const EXPIRA_MIN = Number(Deno.env.get("PIX_EXPIRA_MINUTOS") ?? "120");
const EMAIL_FALLBACK = Deno.env.get("PAYER_EMAIL_FALLBACK") ?? "pagamentos@equipegda.com.br";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "metodo_nao_permitido" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const tipo = body.tipo;
    const db = admin();

    let valor = 0;
    let descricao = "";
    let referenciaId = "";
    let email = EMAIL_FALLBACK;
    let nome: string | undefined;

    if (tipo === "adesivo") {
      if (!uuidValido(body.cadastro_id)) return json(req, { error: "cadastro_invalido" }, 400);
      const { data: c } = await db.from("cadastros")
        .select("id,nome,email,status,numero_piloto,adesivo_pago").eq("id", body.cadastro_id).maybeSingle();
      if (!c) return json(req, { error: "cadastro_nao_encontrado" }, 404);
      if (c.status !== "aprovado") return json(req, { error: "cadastro_nao_aprovado" }, 409);
      if (c.adesivo_pago) return json(req, { error: "adesivo_ja_pago" }, 409);
      valor = PRECO_ADESIVO;
      descricao = "Adesivo de Identificação Oficial - Equipe GDA";
      referenciaId = c.id;
      nome = c.nome;
      if (emailValido(c.email)) email = c.email;
    } else if (tipo === "camisa") {
      const pid = String(body.pedido_id ?? "");
      if (!/^[\w-]{1,64}$/.test(pid)) return json(req, { error: "pedido_invalido" }, 400);
      const { data: p } = await db.from("pedidos")
        .select("id,piloto,status,forma_pagamento,quantidade_camisa,quantidade_balaclava").eq("id", pid).maybeSingle();
      if (!p) return json(req, { error: "pedido_nao_encontrado" }, 404);
      if (p.status !== "pendente") return json(req, { error: "pedido_nao_pendente" }, 409);
      if (p.forma_pagamento !== "vista") return json(req, { error: "pix_apenas_a_vista" }, 409);
      try {
        valor = calcularValorPedido(p);
      } catch (e) {
        return json(req, { error: (e as Error).message }, 422);
      }
      descricao = "Remessa de camisas - Equipe GDA";
      referenciaId = String(p.id);
      nome = p.piloto ?? undefined;
      if (emailValido(body.email)) email = body.email;
    } else {
      return json(req, { error: "tipo_invalido" }, 400);
    }

    valor = moeda(valor);
    // MODO TESTE: se o secret VALOR_TESTE existir (ex.: 1), cobra esse valor em vez do real. REMOVER antes de valer de verdade.
    const vt = Number(Deno.env.get("VALOR_TESTE") ?? "");
    if (vt > 0) valor = moeda(vt);

    // Reaproveita um Pix pendente ainda válido (evita gerar vários QR Codes para o mesmo item).
    const { data: existente } = await db.from("pagamentos").select("*")
      .eq("tipo", tipo).eq("referencia_id", referenciaId).eq("status", "pendente")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existente && existente.qr_code && Number(existente.valor) === valor &&
        existente.expira_em && new Date(existente.expira_em).getTime() > Date.now() + 5 * 60_000) {
      return json(req, saida(existente));
    }

    // 1) cria a linha local (o id dela é o external_reference e a chave de idempotência)
    const { date: expiraDate, iso: expiraIso } = expiracaoMP(EXPIRA_MIN);
    const { data: pg, error: e1 } = await db.from("pagamentos").insert({
      tipo, referencia_id: referenciaId, valor, status: "pendente", expira_em: expiraDate.toISOString(),
    }).select("*").single();
    if (e1 || !pg) {
      console.error("insert pagamentos", e1);
      return json(req, { error: "falha_ao_registrar" }, 500);
    }

    // 2) cria o Pix no Mercado Pago
    const notificationUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/webhook-mercadopago`;
    const r = await fetch(`${MP_API}/v1/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken()}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": pg.id,
      },
      body: JSON.stringify(montarCorpoPix({
        valor, descricao, pagamentoId: pg.id, notificationUrl, email, nome, expiraIso,
      })),
    });
    const mp = await r.json().catch(() => ({}));
    if (!r.ok || !mp?.id) {
      console.error("mp create payment", r.status, JSON.stringify(mp).slice(0, 500));
      await db.from("pagamentos").update({ status: "recusado", updated_at: new Date().toISOString() }).eq("id", pg.id);
      return json(req, { error: "mercadopago_recusou", detalhe: mp?.message ?? null }, 502);
    }

    const td = mp.point_of_interaction?.transaction_data ?? {};
    const { data: atual, error: e2 } = await db.from("pagamentos").update({
      mp_payment_id: mp.id,
      qr_code: td.qr_code ?? null,
      qr_code_base64: td.qr_code_base64 ?? null,
      ticket_url: td.ticket_url ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", pg.id).select("*").single();
    if (e2 || !atual) {
      console.error("update pagamentos", e2);
      return json(req, { error: "falha_ao_registrar" }, 500);
    }
    return json(req, saida(atual));
  } catch (e) {
    console.error("criar-pix", e);
    return json(req, { error: "erro_interno" }, 500);
  }
});

// deno-lint-ignore no-explicit-any
function saida(p: any) {
  return {
    pagamento_id: p.id,
    valor: Number(p.valor),
    status: p.status,
    qr_code: p.qr_code,
    qr_code_base64: p.qr_code_base64,
    ticket_url: p.ticket_url,
    expira_em: p.expira_em,
  };
}
