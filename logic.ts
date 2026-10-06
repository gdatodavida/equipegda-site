// Lógica pura (sem dependências de Deno/Supabase) — testável com Node.
// Usada por criar-pix, verificar-pix e webhook-mercadopago.

export const PRECO_ADESIVO = 19.9;
export const PRECO_CAMISA = 109.9;
export const PRECO_BALACLAVA = 39.9;

/** Arredonda para centavos evitando erros de ponto flutuante (ex.: 3 × 109.90). */
export function moeda(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type PedidoDB = {
  quantidade_camisa?: number | null;
  quantidade_balaclava?: number | null;
  forma_pagamento?: string | null;
  status?: string | null;
};

/** Valor do pedido de camisas — SEMPRE calculado no servidor. */
export function calcularValorPedido(p: PedidoDB): number {
  const qc = Number(p.quantidade_camisa ?? 0);
  const qb = Number(p.quantidade_balaclava ?? 0);
  if (!Number.isInteger(qc) || !Number.isInteger(qb) || qc < 0 || qb < 0 || qc > 50 || qb > 50) {
    throw new Error("quantidades_invalidas");
  }
  const total = moeda(qc * PRECO_CAMISA + qb * PRECO_BALACLAVA);
  if (total <= 0) throw new Error("pedido_sem_itens");
  return total;
}

/** Data de expiração no formato aceito pelo Mercado Pago (fuso -03:00). */
export function expiracaoMP(minutos: number, agora = new Date()): { iso: string; date: Date } {
  const d = new Date(agora.getTime() + minutos * 60_000);
  const brt = new Date(d.getTime() - 3 * 3600_000);
  const iso = brt.toISOString().replace("Z", "-03:00"); // 2026-10-06T12:00:00.000-03:00
  return { iso, date: d };
}

export type CorpoMP = {
  transaction_amount: number;
  payment_method_id: "pix";
  description: string;
  external_reference: string;
  notification_url: string;
  date_of_expiration: string;
  payer: { email: string; first_name?: string };
};

export function montarCorpoPix(args: {
  valor: number;
  descricao: string;
  pagamentoId: string;
  notificationUrl: string;
  email: string;
  nome?: string;
  expiraIso: string;
}): CorpoMP {
  return {
    transaction_amount: args.valor,
    payment_method_id: "pix",
    description: args.descricao,
    external_reference: args.pagamentoId,
    notification_url: args.notificationUrl,
    date_of_expiration: args.expiraIso,
    payer: { email: args.email, ...(args.nome ? { first_name: args.nome.split(" ")[0] } : {}) },
  };
}

// ---------- Assinatura do webhook (x-signature) ----------

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret: string, mensagem: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(mensagem)));
}

export function igualConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Template oficial: id:[data.id];request-id:[x-request-id];ts:[ts]; (partes ausentes são omitidas). */
export function montarManifest(dataId: string | null, requestId: string | null, ts: string | null): string {
  let m = "";
  if (dataId) m += `id:${dataId.toLowerCase()};`;
  if (requestId) m += `request-id:${requestId};`;
  if (ts) m += `ts:${ts};`;
  return m;
}

export function parseXSignature(h: string | null): { ts: string | null; v1: string | null } {
  let ts: string | null = null;
  let v1: string | null = null;
  for (const parte of (h ?? "").split(",")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    const k = parte.slice(0, i).trim();
    const v = parte.slice(i + 1).trim();
    if (k === "ts") ts = v;
    if (k === "v1") v1 = v;
  }
  return { ts, v1 };
}

export async function validarAssinaturaMP(args: {
  secret: string;
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): Promise<boolean> {
  const { ts, v1 } = parseXSignature(args.xSignature);
  if (!ts || !v1 || !args.secret) return false;
  const esperado = await hmacSha256Hex(args.secret, montarManifest(args.dataId, args.xRequestId, ts));
  return igualConstante(esperado, v1.toLowerCase());
}

/** Mapeia status do Mercado Pago → status interno da tabela pagamentos. */
export function mapearStatus(mp: string): "pendente" | "aprovado" | "recusado" | "cancelado" | "expirado" {
  switch (mp) {
    case "approved":
      return "aprovado";
    case "rejected":
      return "recusado";
    case "cancelled":
      return "expirado"; // Pix não pago/expirado costuma vir como cancelled
    case "refunded":
    case "charged_back":
      return "cancelado";
    default:
      return "pendente"; // pending, in_process, authorized...
  }
}

export function emailValido(e: unknown): e is string {
  return typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function uuidValido(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
