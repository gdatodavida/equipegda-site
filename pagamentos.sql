-- ============================================================
-- Equipe GDA — Pagamentos via Pix (Mercado Pago)
-- Cole no Supabase > SQL Editor > Run. Pode rodar mais de uma vez (idempotente).
-- ============================================================

-- 1) Tabela de pagamentos (só o servidor/Edge Functions mexe; o site NÃO lê nem escreve direto)
create table if not exists public.pagamentos (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('adesivo','camisa')),
  referencia_id text not null,                       -- cadastros.id (adesivo) ou pedidos.id (camisa)
  valor         numeric(10,2) not null check (valor > 0),
  status        text not null default 'pendente'
                check (status in ('pendente','aprovado','recusado','cancelado','expirado')),
  mp_payment_id bigint unique,                       -- id do pagamento no Mercado Pago
  qr_code       text,                                -- Pix "copia e cola"
  qr_code_base64 text,                               -- imagem do QR Code
  ticket_url    text,                                -- página do comprovante no Mercado Pago
  expira_em     timestamptz,
  pago_em       timestamptz,
  sincronizado  boolean not null default false,      -- true quando planilha/GDA Vendas já foi atualizada
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists pagamentos_ref_idx on public.pagamentos (tipo, referencia_id, status);

-- RLS ligada e SEM policies = ninguém (anon/authenticated) acessa; a service role das Edge Functions ignora RLS.
alter table public.pagamentos enable row level security;

-- Painel (admin logado) pode apenas LER os pagamentos.
drop policy if exists "pagamentos_admin_select" on public.pagamentos;
create policy "pagamentos_admin_select" on public.pagamentos
  for select to authenticated using (true);

-- 2) Colunas de apoio nas tabelas existentes
alter table public.cadastros add column if not exists adesivo_pago    boolean not null default false;
alter table public.cadastros add column if not exists adesivo_pago_em timestamptz;

-- (pedidos.status já aceita 'pago'; só registramos quando foi pago)
alter table public.pedidos add column if not exists pago_em timestamptz;

create or replace function public.pedidos_marca_pago_em() returns trigger
language plpgsql as $$
begin
  if new.status = 'pago' and (old.status is distinct from 'pago') and new.pago_em is null then
    new.pago_em := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_pedidos_pago_em on public.pedidos;
create trigger trg_pedidos_pago_em before update on public.pedidos
  for each row execute function public.pedidos_marca_pago_em();

-- 3) RPC para o site acompanhar o pagamento (devolve só o status; o id é um UUID não adivinhável)
create or replace function public.consultar_pagamento(p_pagamento_id uuid)
returns table (status text, pago_em timestamptz)
language sql security definer set search_path = public as $$
  select p.status, p.pago_em from public.pagamentos p where p.id = p_pagamento_id;
$$;

revoke all on function public.consultar_pagamento(uuid) from public;
grant execute on function public.consultar_pagamento(uuid) to anon, authenticated;

-- 4) RPC para o site saber se o adesivo daquele cadastro já foi pago (usado na tela de credenciamento)
create or replace function public.adesivo_pago_do_cadastro(p_cadastro_id uuid)
returns boolean
language sql security definer set search_path = public as $$
  select coalesce((select c.adesivo_pago from public.cadastros c where c.id = p_cadastro_id), false);
$$;

revoke all on function public.adesivo_pago_do_cadastro(uuid) from public;
grant execute on function public.adesivo_pago_do_cadastro(uuid) to anon, authenticated;
