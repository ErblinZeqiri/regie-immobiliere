-- =============================================================================
-- Paramètres de la régie — table à ligne unique (id = 1)
-- -----------------------------------------------------------------------------
-- Centralise l'identité de la régie (nom, adresse, contact, IBAN…) utilisée
-- dans les PDF et le footer public. Écriture admin, lecture authentifiée.
-- Idempotent.
-- =============================================================================

create table if not exists public.agency_settings (
  id             int primary key default 1 check (id = 1),
  legal_name     text not null default 'Pron Gérance',
  address        text,
  city           text default 'Ferizaj',
  country        text default 'Kosovo',
  email          text,
  phone          text,
  iban           text,
  account_holder text,                 -- bénéficiaire si différent du nom
  legal_mentions text,                 -- TVA, registre… (optionnel)
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id)
);

-- Ligne unique par défaut.
insert into public.agency_settings (id, legal_name, city, country)
  values (1, 'Pron Gérance', 'Ferizaj', 'Kosovo')
  on conflict (id) do nothing;

alter table public.agency_settings enable row level security;

-- Lecture : tout utilisateur authentifié (le locataire a besoin de l'IBAN pour
-- payer ; les PDF sont générés sous sa session). Écriture : admin uniquement.
drop policy if exists "agency_read" on public.agency_settings;
create policy "agency_read" on public.agency_settings
  for select to authenticated using (true);

drop policy if exists "agency_write" on public.agency_settings;
create policy "agency_write" on public.agency_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.agency_settings to authenticated;
grant insert, update on public.agency_settings to authenticated;

-- Vue publique (footer du site) : colonnes non sensibles, lisibles par anon.
-- La vue appartient au rôle de migration et contourne la RLS de la table.
create or replace view public.agency_public as
  select legal_name, city, country, email, phone
  from public.agency_settings
  where id = 1;

grant select on public.agency_public to anon, authenticated;
