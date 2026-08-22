-- =============================================================================
-- Rapprochement bancaire (Phase 1) — imports de relevés + transactions
-- -----------------------------------------------------------------------------
-- Un import = un fichier CSV. Chaque ligne devient une bank_transaction avec un
-- statut de rapprochement. Admin uniquement. Idempotent.
-- =============================================================================

create table if not exists public.bank_imports (
  id              uuid primary key default gen_random_uuid(),
  filename        text,
  imported_by     uuid references public.profiles(id),
  row_count       int not null default 0,
  validated_count int not null default 0,
  exception_count int not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists public.bank_transactions (
  id                uuid primary key default gen_random_uuid(),
  import_id         uuid references public.bank_imports(id) on delete cascade,
  tx_date           date,
  amount            numeric(12,2) not null,
  label             text,                        -- libellé du virement
  status            text not null default 'exception'
                      check (status in ('validated', 'exception', 'ignored', 'resolved')),
  matched_charge_id uuid references public.rent_charges(id),
  payment_id        uuid references public.payments(id),
  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_bank_tx_import  on public.bank_transactions (import_id);
create index if not exists idx_bank_tx_status  on public.bank_transactions (status);

-- RLS : ADMIN uniquement (le moteur passe par service_role ; ces policies
-- protègent tout accès via le client utilisateur des pages admin).
alter table public.bank_imports       enable row level security;
alter table public.bank_transactions  enable row level security;

drop policy if exists "bank_imports_admin" on public.bank_imports;
create policy "bank_imports_admin" on public.bank_imports
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "bank_transactions_admin" on public.bank_transactions;
create policy "bank_transactions_admin" on public.bank_transactions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.bank_imports      to authenticated;
grant select, insert, update, delete on public.bank_transactions to authenticated;
