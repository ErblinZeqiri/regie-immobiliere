-- =============================================================================
-- Référence de paiement unique par échéance (rapprochement bancaire — Phase 1)
-- -----------------------------------------------------------------------------
-- Format : PG-<BIEN>-<AAAAMM>[C|O]  (voir src/lib/payment-ref.ts)
-- Idempotent.
-- =============================================================================

alter table public.rent_charges
  add column if not exists payment_ref text;

comment on column public.rent_charges.payment_ref is
  'Référence de virement stable et unique (PG-<BIEN>-<AAAAMM>[C|O]). Sert au rapprochement bancaire automatique.';

-- Backfill des échéances existantes (même logique que buildPaymentRef).
update public.rent_charges rc
set payment_ref =
  'PG-' || coalesce(nullif(upper(regexp_replace(p.reference, '[^A-Za-z0-9]', '', 'g')), ''), 'XXX')
  || '-' || to_char(rc.period, 'YYYYMM')
  || case rc.type when 'charges' then 'C' when 'other' then 'O' else '' end
from public.leases l
join public.properties p on p.id = l.property_id
where rc.lease_id = l.id and rc.payment_ref is null;

-- Unicité (parmi les lignes vivantes).
create unique index if not exists idx_rent_charges_payment_ref
  on public.rent_charges (payment_ref)
  where payment_ref is not null and deleted_at is null;
