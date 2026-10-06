// Edge Function: verificar-pix
// Entrada: { "pagamento_id": "<uuid>" }  → consulta o Mercado Pago e atualiza o banco.
// Serve de "rede de segurança" caso o webhook demore ou falhe (o site chama a cada ~10s enquanto o QR está aberto).
import { admin, cors, json, reconciliarPorPagamentoId } from "../_shared/mp.ts";
import { uuidValido } from "../_shared/logic.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "metodo_nao_permitido" }, 405);
  try {
    const { pagamento_id } = await req.json().catch(() => ({}));
    if (!uuidValido(pagamento_id)) return json(req, { error: "pagamento_invalido" }, 400);
    const r = await reconciliarPorPagamentoId(admin(), pagamento_id);
    if (!r) return json(req, { error: "nao_encontrado" }, 404);
    return json(req, { status: r.status, sincronizado: r.sincronizado ?? null });
  } catch (e) {
    console.error("verificar-pix", e);
    return json(req, { error: "erro_interno" }, 500);
  }
});
