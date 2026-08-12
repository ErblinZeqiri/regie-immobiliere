-- =============================================================================
-- FICHIER D'APPLICATION COMPLET (généré) — à coller dans le SQL Editor Supabase
-- Ordre : schéma -> validate_payment -> storage -> applications -> seed
-- =============================================================================

-- ########## 1/5 — SCHÉMA INITIAL ##########
-- =============================================================================
-- Régie immobilière — schéma initial
-- PostgreSQL / Supabase
--
-- Ordre : extensions -> tables -> fonctions -> triggers -> RLS -> index -> vue -> grants
-- Principe de sécurité : RLS activé partout, refus par défaut, autorisations
-- explicites par rôle (admin / owner / tenant) + lecture publique via une VUE.
--
-- Les fonctions d'autorisation sont SECURITY DEFINER : elles s'exécutent avec les
-- droits de leur propriétaire et contournent la RLS des tables qu'elles lisent.
-- C'est ce qui évite la récursion infinie (ex : policy de `properties` qui lit
-- `profiles`, dont la policy relit `profiles`, etc.).
-- =============================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- ---------- Utilisateurs & rôles --------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  role               text not null default 'tenant'
                       check (role in ('admin', 'owner', 'tenant')),
  full_name          text,
  phone              text,
  email              text,
  preferred_language text not null default 'sq'
                       check (preferred_language in ('sq', 'fr', 'de', 'en')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  deleted_at         timestamptz
);
comment on table public.profiles is 'Profil applicatif lié à auth.users. Le rôle est protégé en écriture (voir trigger protect_profile_role).';

-- ---------- Biens ------------------------------------------------------------
create table public.properties (
  id          uuid primary key default gen_random_uuid(),
  reference   text unique,                       -- ex : FER-001
  title       text not null,
  description text,
  address     text,
  city        text not null default 'Ferizaj',
  type        text check (type in ('apartment', 'house', 'commercial', 'land', 'other')),
  surface     numeric(8,2),
  rooms       int,
  floor       int,
  status      text not null default 'available'
                check (status in ('available', 'rented', 'maintenance', 'sold')),
  is_public   boolean not null default false,    -- visible dans les annonces
  owner_id    uuid references public.profiles(id), -- propriétaire de contact / gestionnaire
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  deleted_at  timestamptz
);
comment on column public.properties.owner_id is 'Propriétaire principal / de contact. La propriété réelle (dont indivision) est dans property_owners.';

-- ---------- Copropriété / indivision ----------------------------------------
create table public.property_owners (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id),
  share       numeric(5,2) not null default 100 check (share > 0 and share <= 100),
  created_at  timestamptz not null default now(),
  unique (property_id, owner_id)
);
comment on table public.property_owners is 'Propriétaires réels d''un bien (gère l''indivision, fréquente dans la diaspora).';

-- ---------- Photos des biens (pour les annonces publiques) ------------------
create table public.property_photos (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  file_url    text not null,
  sort_order  int not null default 0,
  is_cover    boolean not null default false,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ---------- Baux -------------------------------------------------------------
create table public.leases (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.properties(id),
  tenant_id      uuid not null references public.profiles(id),
  start_date     date not null,
  end_date       date,
  rent_amount    numeric(12,2) not null,          -- loyer hors charges
  charges_amount numeric(12,2) not null default 0,
  deposit_amount numeric(12,2) not null default 0,
  status         text not null default 'active'
                   check (status in ('active', 'ended', 'terminated')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  deleted_at     timestamptz,
  check (end_date is null or end_date >= start_date)
);

-- ---------- Compta : échéances ----------------------------------------------
create table public.rent_charges (
  id         uuid primary key default gen_random_uuid(),
  lease_id   uuid not null references public.leases(id),
  due_date   date not null,
  period     date,                                -- 1er du mois concerné (anti-doublon)
  label      text,                                -- "Loyer Mars 2026", "Charges T1"
  amount     numeric(12,2) not null check (amount >= 0),
  type       text not null default 'rent'
               check (type in ('rent', 'charges', 'other')),
  status     text not null default 'active'
               check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.rent_charges is 'Échéances. Registre comptable : on annule (status=cancelled) plutôt que de supprimer.';

-- ---------- Compta : paiements ----------------------------------------------
create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  lease_id     uuid not null references public.leases(id),
  amount       numeric(12,2) not null check (amount > 0),
  payment_date date not null,
  method       text check (method in ('bank_transfer', 'cash', 'card', 'other')),
  reference    text,                              -- référence du virement
  proof_url    text,                              -- justificatif (photo/pdf)
  status       text not null default 'pending'
                 check (status in ('pending', 'validated', 'rejected')),
  validated_by uuid references public.profiles(id),
  validated_at timestamptz,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ---------- Compta : allocation paiement -> échéance ------------------------
create table public.payment_allocations (
  id             uuid primary key default gen_random_uuid(),
  payment_id     uuid not null references public.payments(id) on delete cascade,
  rent_charge_id uuid not null references public.rent_charges(id),
  amount         numeric(12,2) not null check (amount > 0),
  created_at     timestamptz not null default now()
);
comment on table public.payment_allocations is 'Fait le lien paiement/échéance et gère les paiements partiels. Intégrité vérifiée par trigger.';

-- ---------- Signalements -----------------------------------------------------
create table public.issues (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  lease_id    uuid references public.leases(id),
  created_by  uuid not null references public.profiles(id),
  title       text not null,
  description text,
  status      text not null default 'open'
                check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority    text not null default 'medium'
                check (priority in ('low', 'medium', 'high', 'urgent')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  deleted_at  timestamptz
);

create table public.issue_photos (
  id         uuid primary key default gen_random_uuid(),
  issue_id   uuid not null references public.issues(id) on delete cascade,
  file_url   text not null,
  created_at timestamptz not null default now()
);

-- ---------- Messagerie -------------------------------------------------------
create table public.message_threads (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id),
  lease_id    uuid references public.leases(id),
  subject     text,
  created_at  timestamptz not null default now()
);

create table public.thread_participants (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.message_threads(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (thread_id, profile_id)
);
comment on table public.thread_participants is 'Membres d''un fil : rend la RLS de la messagerie simple et sûre.';

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.message_threads(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id),
  content    text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- Documents --------------------------------------------------------
create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id),
  lease_id    uuid references public.leases(id),
  uploaded_by uuid references public.profiles(id),
  type        text check (type in ('lease_contract', 'inventory', 'receipt', 'report', 'other')),
  name        text,
  file_url    text not null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ---------- Audit ------------------------------------------------------------
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id),
  action     text not null,                       -- insert, update, delete
  table_name text,
  record_id  uuid,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz not null default now()
);
comment on table public.audit_logs is 'Journal immuable : rempli uniquement par trigger, aucune policy update/delete.';

-- =============================================================================
-- 2. FONCTIONS
-- =============================================================================

-- ---------- Autorisation (SECURITY DEFINER, anti-récursion RLS) -------------

-- Rôle applicatif de l'utilisateur courant (nommé auth_role pour éviter le
-- mot-clé Postgres current_role).
create or replace function public.auth_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles
  where id = (select auth.uid()) and deleted_at is null
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and deleted_at is null
  )
$$;

-- L'utilisateur courant est-il propriétaire du bien (contact ou indivision) ?
create or replace function public.owns_property(p_property_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.properties p
    where p.id = p_property_id and p.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.property_owners po
    where po.property_id = p_property_id and po.owner_id = (select auth.uid())
  )
$$;

-- L'utilisateur courant loue-t-il le bien (bail, tout statut) ?
create or replace function public.rents_property(p_property_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.leases l
    where l.property_id = p_property_id and l.tenant_id = (select auth.uid())
  )
$$;

-- L'utilisateur courant est-il partie prenante d'un bail (locataire OU proprio) ?
create or replace function public.is_lease_party(p_lease_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.leases l
    where l.id = p_lease_id
      and (l.tenant_id = (select auth.uid()) or public.owns_property(l.property_id))
  )
$$;

-- L'utilisateur courant est-il membre d'un fil de discussion ?
create or replace function public.is_thread_participant(p_thread_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.thread_participants tp
    where tp.thread_id = p_thread_id and tp.profile_id = (select auth.uid())
  )
$$;

-- ---------- Utilitaires (triggers) ------------------------------------------

-- Met à jour updated_at automatiquement.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Crée le profil applicatif à l'inscription (rôle par défaut : tenant).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', 'tenant');
  return new;
end;
$$;

-- Empêche un non-admin de modifier son propre rôle (anti-escalade de privilèges).
create or replace function public.protect_profile_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier le rôle';
  end if;
  return new;
end;
$$;

-- Vérifie qu'un paiement n'est pas sur-alloué (somme des allocations <= montant).
create or replace function public.check_allocation()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment_total numeric(12,2);
  v_charge_total  numeric(12,2);
  v_allocated_pay numeric(12,2);
  v_allocated_chg numeric(12,2);
begin
  select amount into v_payment_total from public.payments where id = new.payment_id;
  select amount into v_charge_total  from public.rent_charges where id = new.rent_charge_id;

  select coalesce(sum(amount), 0) into v_allocated_pay
    from public.payment_allocations
    where payment_id = new.payment_id and id <> new.id;

  select coalesce(sum(amount), 0) into v_allocated_chg
    from public.payment_allocations
    where rent_charge_id = new.rent_charge_id and id <> new.id;

  if v_allocated_pay + new.amount > v_payment_total then
    raise exception 'Allocation (%) dépasse le montant du paiement (%)',
      v_allocated_pay + new.amount, v_payment_total;
  end if;

  if v_allocated_chg + new.amount > v_charge_total then
    raise exception 'Allocation (%) dépasse le montant de l''échéance (%)',
      v_allocated_chg + new.amount, v_charge_total;
  end if;

  return new;
end;
$$;

-- Journalise insert/update/delete dans audit_logs (user capturé côté base).
create or replace function public.audit_trigger()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id  uuid;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_id := old.id;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_id := new.id;
  else
    v_new := to_jsonb(new); v_id := new.id;
  end if;

  insert into public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
  values ((select auth.uid()), lower(tg_op), tg_table_name, v_id, v_old, v_new);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- =============================================================================
-- 3. TRIGGERS
-- =============================================================================

-- Création du profil à l'inscription
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Protection du rôle
create trigger trg_protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- updated_at
create trigger trg_profiles_updated   before update on public.profiles   for each row execute function public.set_updated_at();
create trigger trg_properties_updated before update on public.properties for each row execute function public.set_updated_at();
create trigger trg_leases_updated     before update on public.leases     for each row execute function public.set_updated_at();
create trigger trg_issues_updated     before update on public.issues     for each row execute function public.set_updated_at();

-- Intégrité des allocations
create trigger trg_check_allocation
  before insert or update on public.payment_allocations
  for each row execute function public.check_allocation();

-- Audit sur les tables sensibles
create trigger trg_audit_properties  after insert or update or delete on public.properties          for each row execute function public.audit_trigger();
create trigger trg_audit_leases      after insert or update or delete on public.leases              for each row execute function public.audit_trigger();
create trigger trg_audit_charges     after insert or update or delete on public.rent_charges        for each row execute function public.audit_trigger();
create trigger trg_audit_payments    after insert or update or delete on public.payments            for each row execute function public.audit_trigger();
create trigger trg_audit_allocations after insert or update or delete on public.payment_allocations for each row execute function public.audit_trigger();
create trigger trg_audit_issues      after insert or update or delete on public.issues              for each row execute function public.audit_trigger();
create trigger trg_audit_documents   after insert or update or delete on public.documents           for each row execute function public.audit_trigger();

-- =============================================================================
-- 4. ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles            enable row level security;
alter table public.properties          enable row level security;
alter table public.property_owners     enable row level security;
alter table public.property_photos     enable row level security;
alter table public.leases              enable row level security;
alter table public.rent_charges        enable row level security;
alter table public.payments            enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.issues              enable row level security;
alter table public.issue_photos        enable row level security;
alter table public.message_threads     enable row level security;
alter table public.thread_participants enable row level security;
alter table public.messages            enable row level security;
alter table public.documents           enable row level security;
alter table public.audit_logs          enable row level security;

-- ---------- profiles ---------------------------------------------------------
create policy "profiles_select" on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or public.is_admin()
  or exists (  -- un propriétaire voit les profils de ses locataires
    select 1 from public.leases l
    where l.tenant_id = public.profiles.id and public.owns_property(l.property_id)
  )
);
create policy "profiles_update_self" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles_admin_all" on public.profiles for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------- properties -------------------------------------------------------
create policy "properties_select" on public.properties for select to authenticated
using (public.is_admin() or public.owns_property(id) or public.rents_property(id));
create policy "properties_admin_all" on public.properties for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------- property_owners --------------------------------------------------
create policy "property_owners_select" on public.property_owners for select to authenticated
using (public.is_admin() or owner_id = (select auth.uid()));
create policy "property_owners_admin_all" on public.property_owners for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------- property_photos (lecture publique pour les annonces) ------------
create policy "property_photos_select" on public.property_photos for select
using (
  public.is_admin()
  or public.owns_property(property_id)
  or public.rents_property(property_id)
  or exists (
    select 1 from public.properties p
    where p.id = property_id and p.is_public and p.status = 'available' and p.deleted_at is null
  )
);
create policy "property_photos_admin_all" on public.property_photos for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------- leases -----------------------------------------------------------
create policy "leases_select" on public.leases for select to authenticated
using (public.is_admin() or tenant_id = (select auth.uid()) or public.owns_property(property_id));
create policy "leases_admin_all" on public.leases for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------- rent_charges -----------------------------------------------------
create policy "rent_charges_select" on public.rent_charges for select to authenticated
using (public.is_admin() or public.is_lease_party(lease_id));
create policy "rent_charges_admin_all" on public.rent_charges for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------- payments ---------------------------------------------------------
create policy "payments_select" on public.payments for select to authenticated
using (public.is_admin() or public.is_lease_party(lease_id));
-- Le locataire peut déclarer un paiement (toujours en 'pending')
create policy "payments_tenant_declare" on public.payments for insert to authenticated
with check (
  status = 'pending'
  and exists (select 1 from public.leases l where l.id = lease_id and l.tenant_id = (select auth.uid()))
);
create policy "payments_admin_all" on public.payments for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------- payment_allocations ---------------------------------------------
create policy "payment_allocations_select" on public.payment_allocations for select to authenticated
using (
  public.is_admin()
  or exists (select 1 from public.payments p where p.id = payment_id and public.is_lease_party(p.lease_id))
);
create policy "payment_allocations_admin_all" on public.payment_allocations for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------- issues -----------------------------------------------------------
create policy "issues_select" on public.issues for select to authenticated
using (public.is_admin() or public.owns_property(property_id) or public.rents_property(property_id));
create policy "issues_insert" on public.issues for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (public.rents_property(property_id) or public.owns_property(property_id))
);
create policy "issues_update_creator" on public.issues for update to authenticated
using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy "issues_admin_all" on public.issues for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------- issue_photos -----------------------------------------------------
create policy "issue_photos_select" on public.issue_photos for select to authenticated
using (
  exists (
    select 1 from public.issues i
    where i.id = issue_id
      and (public.is_admin() or public.owns_property(i.property_id) or public.rents_property(i.property_id))
  )
);
create policy "issue_photos_insert" on public.issue_photos for insert to authenticated
with check (
  exists (
    select 1 from public.issues i
    where i.id = issue_id
      and (i.created_by = (select auth.uid()) or public.is_admin())
  )
);
create policy "issue_photos_admin_all" on public.issue_photos for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------- message_threads --------------------------------------------------
create policy "threads_select" on public.message_threads for select to authenticated
using (public.is_admin() or public.is_thread_participant(id));
create policy "threads_admin_all" on public.message_threads for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------- thread_participants ---------------------------------------------
create policy "participants_select" on public.thread_participants for select to authenticated
using (public.is_admin() or public.is_thread_participant(thread_id));
create policy "participants_admin_all" on public.thread_participants for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------- messages ---------------------------------------------------------
create policy "messages_select" on public.messages for select to authenticated
using (public.is_admin() or public.is_thread_participant(thread_id));
create policy "messages_insert" on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and public.is_thread_participant(thread_id)
);
create policy "messages_admin_all" on public.messages for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------- documents --------------------------------------------------------
create policy "documents_select" on public.documents for select to authenticated
using (
  public.is_admin()
  or (lease_id is not null and public.is_lease_party(lease_id))
  or (property_id is not null and (public.owns_property(property_id) or public.rents_property(property_id)))
);
create policy "documents_admin_all" on public.documents for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- ---------- audit_logs (lecture admin, jamais de modif) ---------------------
create policy "audit_logs_select_admin" on public.audit_logs for select to authenticated
using (public.is_admin());
-- Aucune policy insert/update/delete : seul le trigger (SECURITY DEFINER) écrit.

-- =============================================================================
-- 5. INDEX (les FK utilisées en RLS ne sont pas indexées automatiquement)
-- =============================================================================

create index idx_properties_owner            on public.properties (owner_id) where deleted_at is null;
create index idx_properties_public           on public.properties (is_public, status) where deleted_at is null;
create index idx_property_owners_property     on public.property_owners (property_id);
create index idx_property_owners_owner        on public.property_owners (owner_id);
create index idx_property_photos_property     on public.property_photos (property_id);
create index idx_leases_property              on public.leases (property_id);
create index idx_leases_tenant                on public.leases (tenant_id);
create index idx_rent_charges_lease           on public.rent_charges (lease_id);
create index idx_payments_lease               on public.payments (lease_id);
create index idx_payments_status              on public.payments (status);
create index idx_allocations_payment          on public.payment_allocations (payment_id);
create index idx_allocations_charge           on public.payment_allocations (rent_charge_id);
create index idx_issues_property              on public.issues (property_id);
create index idx_issues_lease                 on public.issues (lease_id);
create index idx_issue_photos_issue           on public.issue_photos (issue_id);
create index idx_participants_thread          on public.thread_participants (thread_id);
create index idx_participants_profile         on public.thread_participants (profile_id);
create index idx_messages_thread              on public.messages (thread_id);
create index idx_documents_property           on public.documents (property_id);
create index idx_documents_lease              on public.documents (lease_id);
create index idx_audit_record                 on public.audit_logs (table_name, record_id);

-- Anti-doublon d'échéance (une seule "Loyer <période>" par bail/type)
create unique index uniq_charge_period
  on public.rent_charges (lease_id, type, period)
  where period is not null and deleted_at is null;

-- =============================================================================
-- 6. VUE PUBLIQUE (annonces) — n'expose que des colonnes safe, pas owner_id
-- =============================================================================
-- La vue appartient au rôle de migration et contourne la RLS de `properties`.
-- Le public interroge la VUE, jamais la table.

create view public.public_listings as
  select
    id, reference, title, description, address, city, type,
    surface, rooms, floor, created_at
  from public.properties
  where is_public = true and status = 'available' and deleted_at is null;

-- =============================================================================
-- 7. GRANTS
-- =============================================================================
-- Les rôles Supabase : anon (non connecté), authenticated (connecté).
-- L'accès aux LIGNES reste gouverné par la RLS ci-dessus ; les GRANTS ouvrent
-- seulement l'accès aux TABLES/vues.

-- Public (non connecté) : uniquement les annonces et leurs photos.
grant select on public.public_listings to anon, authenticated;
grant select on public.property_photos to anon;

-- Connectés : accès aux tables applicatives (filtré ligne à ligne par la RLS).
grant select, insert, update, delete on
  public.profiles, public.properties, public.property_owners, public.property_photos,
  public.leases, public.rent_charges, public.payments, public.payment_allocations,
  public.issues, public.issue_photos, public.message_threads, public.thread_participants,
  public.messages, public.documents
to authenticated;

grant select on public.audit_logs to authenticated;

-- =============================================================================
-- Fin de la migration
-- =============================================================================

-- ########## 2/5 — FONCTION validate_payment ##########
-- =============================================================================
-- Fonction validate_payment — validation atomique d'un paiement + allocations
--
-- Appelée UNIQUEMENT par la Server Action validatePayment (via service_role,
-- après requireAdmin()). Le corps d'une fonction PL/pgSQL s'exécute dans une
-- seule transaction : soit tout réussit, soit rien n'est écrit.
--
-- p_allocations : jsonb [{"rent_charge_id":"uuid","amount":123.45}, ...]
--   - fourni   -> allocations explicites (plafonds vérifiés par check_allocation)
--   - null     -> auto-allocation FIFO sur les échéances les plus anciennes
--                 non soldées (gère le paiement partiel)
-- =============================================================================

create or replace function public.validate_payment(
  p_payment_id   uuid,
  p_validated_by uuid,
  p_allocations  jsonb default null
)
returns public.payments
language plpgsql
as $$
declare
  v_payment   public.payments;
  v_lease     uuid;
  v_remaining numeric(12,2);
  v_alloc     jsonb;
  v_charge    record;
  v_charge_remaining numeric(12,2);
  v_to_alloc  numeric(12,2);
begin
  -- Verrouille le paiement le temps de la transaction
  select * into v_payment from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Paiement introuvable (%)', p_payment_id;
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Paiement déjà traité (statut : %)', v_payment.status;
  end if;

  v_lease := v_payment.lease_id;
  v_remaining := v_payment.amount;

  if p_allocations is not null then
    -- ---- Allocations explicites ------------------------------------------
    for v_alloc in select * from jsonb_array_elements(p_allocations)
    loop
      -- l'échéance doit appartenir au même bail et être active
      perform 1 from public.rent_charges c
      where c.id = (v_alloc->>'rent_charge_id')::uuid
        and c.lease_id = v_lease
        and c.status = 'active'
        and c.deleted_at is null;
      if not found then
        raise exception 'Échéance % invalide pour ce bail', v_alloc->>'rent_charge_id';
      end if;

      -- le trigger check_allocation vérifie les plafonds (paiement + échéance)
      insert into public.payment_allocations (payment_id, rent_charge_id, amount)
      values (p_payment_id,
              (v_alloc->>'rent_charge_id')::uuid,
              (v_alloc->>'amount')::numeric);
    end loop;
  else
    -- ---- Auto-allocation FIFO --------------------------------------------
    for v_charge in
      select c.id,
             c.amount
               - coalesce((select sum(a.amount)
                           from public.payment_allocations a
                           where a.rent_charge_id = c.id), 0) as remaining
      from public.rent_charges c
      where c.lease_id = v_lease
        and c.status = 'active'
        and c.deleted_at is null
      order by c.due_date asc
    loop
      exit when v_remaining <= 0;
      v_charge_remaining := v_charge.remaining;
      if v_charge_remaining <= 0 then
        continue; -- échéance déjà soldée
      end if;

      v_to_alloc := least(v_remaining, v_charge_remaining);
      insert into public.payment_allocations (payment_id, rent_charge_id, amount)
      values (p_payment_id, v_charge.id, v_to_alloc);

      v_remaining := v_remaining - v_to_alloc;
    end loop;
    -- v_remaining > 0 ici = trop-perçu (avance) : laissé non alloué, visible
    -- comme crédit (payment.amount - somme des allocations).
  end if;

  -- ---- Validation du paiement --------------------------------------------
  update public.payments
  set status = 'validated',
      validated_by = p_validated_by,
      validated_at = now()
  where id = p_payment_id
  returning * into v_payment;

  return v_payment;
end;
$$;

-- Cette fonction ne doit être appelable QUE par le serveur (service_role).
revoke all on function public.validate_payment(uuid, uuid, jsonb) from public;
revoke all on function public.validate_payment(uuid, uuid, jsonb) from anon, authenticated;
grant execute on function public.validate_payment(uuid, uuid, jsonb) to service_role;

-- ########## 3/5 — STORAGE (buckets + policies) ##########
-- =============================================================================
-- Storage : buckets privés + policies alignées sur la RLS
--
-- PRINCIPE : le CHEMIN du fichier encode la relation. Les policies décodent le
-- 1er (ou 2e) dossier du chemin et réutilisent les mêmes fonctions
-- SECURITY DEFINER que la RLS des tables (owns_property, rents_property,
-- is_lease_party…). storage.foldername(name) renvoie le tableau des dossiers
-- (hors nom de fichier), indexé à partir de 1.
--
-- CONVENTIONS DE CHEMIN (à respecter côté application) :
--   documents        lease/{leaseId}/...     OU  property/{propertyId}/...
--   issue-photos     {issueId}/...
--   proofs           {leaseId}/...
--   property-photos  {propertyId}/...
--
-- RAPPEL : les URLs signées générées côté serveur (service_role) contournent
-- ces policies — elles ne s'appliquent qu'aux accès DIRECTS depuis le client
-- (upload de photos/justificatifs, lecture des annonces par le public).
-- =============================================================================

-- =============================================================================
-- 1. BUCKETS (tous privés)
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents',       'documents',       false, 10485760, array['application/pdf']),
  ('issue-photos',    'issue-photos',    false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('proofs',          'proofs',          false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('property-photos', 'property-photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- =============================================================================
-- 2. FONCTIONS HELPER supplémentaires (SECURITY DEFINER)
-- =============================================================================

-- L'utilisateur courant est-il LE LOCATAIRE de ce bail ?
create or replace function public.is_lease_tenant(p_lease_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.leases l
    where l.id = p_lease_id and l.tenant_id = (select auth.uid())
  )
$$;

-- Le bien est-il en annonce publique (visible par anon) ?
create or replace function public.is_property_public(p_property_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.properties p
    where p.id = p_property_id
      and p.is_public = true
      and p.status = 'available'
      and p.deleted_at is null
  )
$$;

-- L'utilisateur courant peut-il VOIR ce signalement ?
create or replace function public.can_view_issue(p_issue_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.issues i
    where i.id = p_issue_id
      and (
        public.is_admin()
        or public.owns_property(i.property_id)
        or public.rents_property(i.property_id)
      )
  )
$$;

-- L'utilisateur courant est-il le CRÉATEUR de ce signalement ?
create or replace function public.is_issue_creator(p_issue_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.issues i
    where i.id = p_issue_id and i.created_by = (select auth.uid())
  )
$$;

-- =============================================================================
-- 3. POLICIES — bucket "documents"  (chemin : lease/{id}/... ou property/{id}/...)
-- =============================================================================
-- Lecture : admin, ou partie prenante du bail / du bien.
create policy "documents_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'documents' and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = 'lease'
      and public.is_lease_party(((storage.foldername(name))[2])::uuid)
    )
    or (
      (storage.foldername(name))[1] = 'property'
      and (
        public.owns_property(((storage.foldername(name))[2])::uuid)
        or public.rents_property(((storage.foldername(name))[2])::uuid)
      )
    )
  )
);

-- Écriture réservée à l'admin (contrats, quittances, états des lieux = régie).
create policy "documents_admin_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'documents' and public.is_admin());

create policy "documents_admin_update"
on storage.objects for update to authenticated
using (bucket_id = 'documents' and public.is_admin())
with check (bucket_id = 'documents' and public.is_admin());

create policy "documents_admin_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'documents' and public.is_admin());

-- =============================================================================
-- 4. POLICIES — bucket "issue-photos"  (chemin : {issueId}/...)
-- =============================================================================
-- Lecture : quiconque peut voir le signalement (admin / proprio / locataire).
create policy "issue_photos_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'issue-photos'
  and public.can_view_issue(((storage.foldername(name))[1])::uuid)
);

-- Upload : le créateur du signalement (ou l'admin).
create policy "issue_photos_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'issue-photos'
  and (
    public.is_admin()
    or public.is_issue_creator(((storage.foldername(name))[1])::uuid)
  )
);

-- Suppression : créateur ou admin.
create policy "issue_photos_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'issue-photos'
  and (
    public.is_admin()
    or public.is_issue_creator(((storage.foldername(name))[1])::uuid)
  )
);

-- =============================================================================
-- 5. POLICIES — bucket "proofs"  (chemin : {leaseId}/...)
-- =============================================================================
-- Lecture : admin, ou partie prenante du bail (le proprio voit aussi les
-- justificatifs des loyers de son bien).
create policy "proofs_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'proofs'
  and (
    public.is_admin()
    or public.is_lease_party(((storage.foldername(name))[1])::uuid)
  )
);

-- Upload : uniquement LE LOCATAIRE du bail concerné (ou l'admin).
create policy "proofs_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'proofs'
  and (
    public.is_admin()
    or public.is_lease_tenant(((storage.foldername(name))[1])::uuid)
  )
);

-- Suppression : admin uniquement (un justificatif ne s'efface pas côté locataire).
create policy "proofs_admin_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'proofs' and public.is_admin());

-- =============================================================================
-- 6. POLICIES — bucket "property-photos"  (chemin : {propertyId}/...)
-- =============================================================================
-- Lecture : PUBLIQUE si le bien est en annonce (anon), sinon admin/proprio/locataire.
-- (Pour anon : is_admin / owns / rents valent false car auth.uid() est null ;
--  seule la clause is_property_public autorise l'accès.)
create policy "property_photos_select"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'property-photos'
  and (
    public.is_property_public(((storage.foldername(name))[1])::uuid)
    or public.is_admin()
    or public.owns_property(((storage.foldername(name))[1])::uuid)
    or public.rents_property(((storage.foldername(name))[1])::uuid)
  )
);

-- Écriture réservée à l'admin (la régie gère les photos des biens).
create policy "property_photos_admin_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'property-photos' and public.is_admin());

create policy "property_photos_admin_update"
on storage.objects for update to authenticated
using (bucket_id = 'property-photos' and public.is_admin())
with check (bucket_id = 'property-photos' and public.is_admin());

create policy "property_photos_admin_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'property-photos' and public.is_admin());

-- =============================================================================
-- Fin — policies Storage
-- =============================================================================

-- ########## 4/5 — CANDIDATURES ##########
-- =============================================================================
-- Candidatures / demandes de contact issues des annonces publiques
-- =============================================================================
create table public.applications (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id),
  full_name   text not null,
  email       text not null,
  phone       text,
  message     text,
  status      text not null default 'new' check (status in ('new', 'contacted', 'archived')),
  created_at  timestamptz not null default now()
);

create index idx_applications_property on public.applications (property_id);
create index idx_applications_status on public.applications (status);

alter table public.applications enable row level security;

-- INSERT public : anon/authenticated peuvent candidater, MAIS uniquement pour un
-- bien réellement en annonce publique (anti-spam sur des property_id arbitraires).
-- (is_property_public est défini dans la migration 20260811000200.)
create policy "applications_public_insert"
on public.applications for insert to anon, authenticated
with check (property_id is null or public.is_property_public(property_id));

-- Lecture / gestion réservées à l'admin.
create policy "applications_admin_all"
on public.applications for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant insert on public.applications to anon, authenticated;
grant select on public.applications to authenticated;

-- ########## 5/5 — DONNÉES DE TEST (seed) ##########
-- =============================================================================
-- Régie immobilière — données de test (seed)
-- À exécuter APRÈS la migration de schéma.
--   supabase db reset      (rejoue migrations + seed.sql)
--   ou : psql "$DATABASE_URL" -f supabase/seed.sql
--
-- Mot de passe de TOUS les comptes : password123
-- (haché via crypt() de pgcrypto ; si crypt() n'est pas trouvé, préfixe par
--  extensions.crypt / extensions.gen_salt selon ton installation Supabase.)
-- =============================================================================
--
-- LÉGENDE DES UUID
-- ----------------------------------------------------------------------------
-- ADMIN      11111111-1111-1111-1111-111111111111  admin@regie.test
-- OWNER A    22222222-2222-2222-2222-222222222221  ownerA@regie.test
-- OWNER B    22222222-2222-2222-2222-222222222222  ownerB@regie.test
-- TENANT 1   33333333-3333-3333-3333-333333333331  tenant1@regie.test
-- TENANT 2   33333333-3333-3333-3333-333333333332  tenant2@regie.test
-- TENANT 3   33333333-3333-3333-3333-333333333333  tenant3@regie.test
--
-- BIENS
--   P1 a0000000-…-0001  FER-001  Owner A          LOUÉ par Tenant 1
--   P2 a0000000-…-0002  FER-002  Owner A          LIBRE + PUBLIC (annonce)
--   P3 a0000000-…-0003  FER-003  Owner B          LOUÉ par Tenant 2
--   P4 a0000000-…-0004  FER-004  INDIVISION A+B   LOUÉ par Tenant 3
--   P5 a0000000-…-0005  FER-005  Owner B          LIBRE + PUBLIC (annonce)
--
-- BAUX
--   L1 b0000000-…-0001  P1 / Tenant 1   loyer 300 + charges 50
--   L2 b0000000-…-0002  P3 / Tenant 2   loyer 350 + charges 40
--   L3 b0000000-…-0003  P4 / Tenant 3   loyer 400 + charges 60
--
-- Échéances : juin / juillet / août 2026 pour chaque bail.
-- Paiements : validés, un PENDING (L2 juillet), un PARTIEL (L1 août 150/300).
-- =============================================================================

begin;

-- --- On désactive temporairement les triggers qui gênent le seed ------------
-- protect_profile_role empêcherait le changement de rôle (auth.uid() est null
-- pendant le seed) ; les triggers d'audit ajouteraient du bruit dans audit_logs.
-- (On NE touche PAS à on_auth_user_created : il crée automatiquement les
--  profils quand on insère dans auth.users.)
alter table public.profiles   disable trigger trg_protect_profile_role;
alter table public.properties disable trigger trg_audit_properties;
alter table public.leases     disable trigger trg_audit_leases;
alter table public.rent_charges disable trigger trg_audit_charges;
alter table public.payments   disable trigger trg_audit_payments;
alter table public.payment_allocations disable trigger trg_audit_allocations;
alter table public.issues     disable trigger trg_audit_issues;
alter table public.documents  disable trigger trg_audit_documents;

-- =============================================================================
-- 1. COMPTES (auth.users) — le trigger handle_new_user crée les profils
-- =============================================================================
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'admin@regie.test',   crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Admin Régie"}', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222221', 'authenticated', 'authenticated',
   'ownerA@regie.test',  crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Agron Krasniqi (Owner A)"}', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'ownerB@regie.test',  crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Blerta Gashi (Owner B)"}', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333331', 'authenticated', 'authenticated',
   'tenant1@regie.test', crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Driton Berisha (Tenant 1)"}', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333332', 'authenticated', 'authenticated',
   'tenant2@regie.test', crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Elira Hoxha (Tenant 2)"}', '', '', '', ''),

  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated',
   'tenant3@regie.test', crypt('password123', gen_salt('bf')), now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Faton Rexhepi (Tenant 3)"}', '', '', '', '');

-- Identités (permet la connexion email/password sous GoTrue)
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email),
       'email', now(), now(), now()
from auth.users u
where u.id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333331',
  '33333333-3333-3333-3333-333333333332',
  '33333333-3333-3333-3333-333333333333'
);

-- =============================================================================
-- 2. PROFILS — on fixe le rôle et les infos (profils déjà créés par le trigger)
-- =============================================================================
update public.profiles set role='admin', phone='+383 44 000 001', preferred_language='sq'
  where id='11111111-1111-1111-1111-111111111111';
update public.profiles set role='owner', phone='+41 79 000 002', preferred_language='de'
  where id='22222222-2222-2222-2222-222222222221';  -- diaspora Suisse
update public.profiles set role='owner', phone='+49 151 000 003', preferred_language='de'
  where id='22222222-2222-2222-2222-222222222222';  -- diaspora Allemagne
update public.profiles set role='tenant', phone='+383 44 000 011', preferred_language='sq'
  where id='33333333-3333-3333-3333-333333333331';
update public.profiles set role='tenant', phone='+383 44 000 012', preferred_language='sq'
  where id='33333333-3333-3333-3333-333333333332';
update public.profiles set role='tenant', phone='+383 44 000 013', preferred_language='sq'
  where id='33333333-3333-3333-3333-333333333333';

-- =============================================================================
-- 3. BIENS
-- =============================================================================
insert into public.properties (id, reference, title, description, address, city, type, surface, rooms, floor, status, is_public, owner_id)
values
  ('a0000000-0000-0000-0000-000000000001', 'FER-001', 'Appartement 2 pièces centre',
   'Proche du centre de Ferizaj, rénové.', 'Rr. Dëshmorët e Kombit 12', 'Ferizaj', 'apartment', 55.00, 2, 3,
   'rented', false, '22222222-2222-2222-2222-222222222221'),

  ('a0000000-0000-0000-0000-000000000002', 'FER-002', 'Studio lumineux',
   'Studio idéal étudiant, disponible immédiatement.', 'Rr. Rexhep Bislimi 4', 'Ferizaj', 'apartment', 32.00, 1, 1,
   'available', true, '22222222-2222-2222-2222-222222222221'),

  ('a0000000-0000-0000-0000-000000000003', 'FER-003', 'Appartement 3 pièces',
   'Grand appartement familial avec balcon.', 'Rr. Adem Jashari 27', 'Ferizaj', 'apartment', 78.00, 3, 5,
   'rented', false, '22222222-2222-2222-2222-222222222222'),

  ('a0000000-0000-0000-0000-000000000004', 'FER-004', 'Maison en indivision',
   'Bien détenu en indivision (héritage).', 'Rr. Ismail Qemali 9', 'Ferizaj', 'house', 120.00, 4, 0,
   'rented', false, '22222222-2222-2222-2222-222222222221'),  -- owner_id = contact (Owner A)

  ('a0000000-0000-0000-0000-000000000005', 'FER-005', 'Appartement neuf à louer',
   'Construction récente, disponible.', 'Rr. Enver Topalli 15', 'Ferizaj', 'apartment', 64.00, 2, 2,
   'available', true, '22222222-2222-2222-2222-222222222222');

-- Indivision sur P4 : Owner A 50% + Owner B 50%
insert into public.property_owners (id, property_id, owner_id, share)
values
  ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222221', 50.00),
  ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 50.00);

-- Photos (P2 et P5 publiques → visibles par anon ; P1 privée → NON visible par anon)
insert into public.property_photos (id, property_id, file_url, sort_order, is_cover)
values
  ('e1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'photos/fer-001-1.jpg', 0, true),   -- privée
  ('e1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'photos/fer-002-1.jpg', 0, true),   -- publique
  ('e1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'photos/fer-002-2.jpg', 1, false),  -- publique
  ('e1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005', 'photos/fer-005-1.jpg', 0, true);   -- publique

-- =============================================================================
-- 4. BAUX
-- =============================================================================
insert into public.leases (id, property_id, tenant_id, start_date, end_date, rent_amount, charges_amount, deposit_amount, status)
values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333331',
   '2026-01-01', null, 300.00, 50.00, 600.00, 'active'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333332',
   '2025-09-01', null, 350.00, 40.00, 700.00, 'active'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333',
   '2026-03-01', null, 400.00, 60.00, 800.00, 'active');

-- =============================================================================
-- 5. ÉCHÉANCES (rent_charges) — juin / juillet / août 2026
-- =============================================================================
insert into public.rent_charges (id, lease_id, due_date, period, label, amount, type)
values
  -- L1 (300)
  ('c0000000-0000-0000-0000-000000000101', 'b0000000-0000-0000-0000-000000000001', '2026-06-05', '2026-06-01', 'Loyer Juin 2026',    300.00, 'rent'),
  ('c0000000-0000-0000-0000-000000000102', 'b0000000-0000-0000-0000-000000000001', '2026-07-05', '2026-07-01', 'Loyer Juillet 2026', 300.00, 'rent'),
  ('c0000000-0000-0000-0000-000000000103', 'b0000000-0000-0000-0000-000000000001', '2026-08-05', '2026-08-01', 'Loyer Août 2026',    300.00, 'rent'),
  -- L2 (350)
  ('c0000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000002', '2026-06-05', '2026-06-01', 'Loyer Juin 2026',    350.00, 'rent'),
  ('c0000000-0000-0000-0000-000000000202', 'b0000000-0000-0000-0000-000000000002', '2026-07-05', '2026-07-01', 'Loyer Juillet 2026', 350.00, 'rent'),
  ('c0000000-0000-0000-0000-000000000203', 'b0000000-0000-0000-0000-000000000002', '2026-08-05', '2026-08-01', 'Loyer Août 2026',    350.00, 'rent'),
  -- L3 (400)
  ('c0000000-0000-0000-0000-000000000301', 'b0000000-0000-0000-0000-000000000003', '2026-06-05', '2026-06-01', 'Loyer Juin 2026',    400.00, 'rent'),
  ('c0000000-0000-0000-0000-000000000302', 'b0000000-0000-0000-0000-000000000003', '2026-07-05', '2026-07-01', 'Loyer Juillet 2026', 400.00, 'rent'),
  ('c0000000-0000-0000-0000-000000000303', 'b0000000-0000-0000-0000-000000000003', '2026-08-05', '2026-08-01', 'Loyer Août 2026',    400.00, 'rent');

-- =============================================================================
-- 6. PAIEMENTS
--   L1 : juin OK, juillet OK, août PARTIEL (150/300)
--   L2 : juin OK, juillet EN ATTENTE (déclaré par le locataire, pas validé)
--   L3 : juin OK, juillet OK  (août non payé)
-- =============================================================================
insert into public.payments (id, lease_id, amount, payment_date, method, reference, status, validated_by, validated_at)
values
  ('d0000000-0000-0000-0000-000000000101', 'b0000000-0000-0000-0000-000000000001', 300.00, '2026-06-03', 'bank_transfer', 'VIR-L1-06', 'validated', '11111111-1111-1111-1111-111111111111', now()),
  ('d0000000-0000-0000-0000-000000000102', 'b0000000-0000-0000-0000-000000000001', 300.00, '2026-07-04', 'bank_transfer', 'VIR-L1-07', 'validated', '11111111-1111-1111-1111-111111111111', now()),
  ('d0000000-0000-0000-0000-000000000103', 'b0000000-0000-0000-0000-000000000001', 150.00, '2026-08-04', 'bank_transfer', 'VIR-L1-08', 'validated', '11111111-1111-1111-1111-111111111111', now()),  -- PARTIEL
  ('d0000000-0000-0000-0000-000000000201', 'b0000000-0000-0000-0000-000000000002', 350.00, '2026-06-02', 'bank_transfer', 'VIR-L2-06', 'validated', '11111111-1111-1111-1111-111111111111', now()),
  ('d0000000-0000-0000-0000-000000000202', 'b0000000-0000-0000-0000-000000000002', 350.00, '2026-07-06', 'bank_transfer', 'VIR-L2-07', 'pending',   null, null),  -- EN ATTENTE
  ('d0000000-0000-0000-0000-000000000301', 'b0000000-0000-0000-0000-000000000003', 400.00, '2026-06-01', 'cash',          null,        'validated', '11111111-1111-1111-1111-111111111111', now()),
  ('d0000000-0000-0000-0000-000000000302', 'b0000000-0000-0000-0000-000000000003', 400.00, '2026-07-03', 'bank_transfer', 'VIR-L3-07', 'validated', '11111111-1111-1111-1111-111111111111', now());

-- Allocations paiement -> échéance (la pending L2-07 n'est pas allouée)
insert into public.payment_allocations (id, payment_id, rent_charge_id, amount)
values
  ('a1000000-0000-0000-0000-000000000101', 'd0000000-0000-0000-0000-000000000101', 'c0000000-0000-0000-0000-000000000101', 300.00),
  ('a1000000-0000-0000-0000-000000000102', 'd0000000-0000-0000-0000-000000000102', 'c0000000-0000-0000-0000-000000000102', 300.00),
  ('a1000000-0000-0000-0000-000000000103', 'd0000000-0000-0000-0000-000000000103', 'c0000000-0000-0000-0000-000000000103', 150.00),  -- PARTIEL : reste 150 dû
  ('a1000000-0000-0000-0000-000000000201', 'd0000000-0000-0000-0000-000000000201', 'c0000000-0000-0000-0000-000000000201', 350.00),
  ('a1000000-0000-0000-0000-000000000301', 'd0000000-0000-0000-0000-000000000301', 'c0000000-0000-0000-0000-000000000301', 400.00),
  ('a1000000-0000-0000-0000-000000000302', 'd0000000-0000-0000-0000-000000000302', 'c0000000-0000-0000-0000-000000000302', 400.00);

-- =============================================================================
-- 7. SIGNALEMENTS
-- =============================================================================
insert into public.issues (id, property_id, lease_id, created_by, title, description, status, priority)
values
  ('70000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333331', 'Fuite sous l''évier', 'Fuite d''eau sous l''évier de la cuisine.', 'open', 'high'),
  ('70000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003',
   '33333333-3333-3333-3333-333333333333', 'Chauffage en panne', 'Le radiateur du salon ne chauffe plus.', 'in_progress', 'urgent'),
  ('70000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002',
   '33333333-3333-3333-3333-333333333332', 'Volet bloqué', 'Le volet de la chambre est bloqué.', 'open', 'low');

insert into public.issue_photos (id, issue_id, file_url)
values
  ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'issues/heating-1.jpg');

-- =============================================================================
-- 8. DOCUMENTS
-- =============================================================================
insert into public.documents (id, property_id, lease_id, uploaded_by, type, name, file_url)
values
  ('80000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111', 'lease_contract', 'Contrat de bail — FER-001', 'docs/lease-fer001.pdf'),
  ('80000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111', 'inventory', 'État des lieux — FER-004', 'docs/inventory-fer004.pdf'),
  ('80000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002',
   '11111111-1111-1111-1111-111111111111', 'receipt', 'Quittance Juin 2026 — FER-003', 'docs/receipt-fer003-06.pdf');

-- =============================================================================
-- 9. MESSAGERIE
--   Fil 1 : Admin <-> Tenant 1 (à propos de P1/L1)
--   Fil 2 : Admin <-> Owner A  (à propos de P4/L3, indivision)
-- =============================================================================
insert into public.message_threads (id, property_id, lease_id, subject)
values
  ('90000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Fuite cuisine — suivi'),
  ('90000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003', 'Travaux chauffage FER-004');

insert into public.thread_participants (id, thread_id, profile_id)
values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'), -- admin
  ('91000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333331'), -- tenant 1
  ('91000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111'), -- admin
  ('91000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222221'); -- owner A

insert into public.messages (id, thread_id, sender_id, content)
values
  ('92000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333331', 'Bonjour, la fuite s''aggrave.'),
  ('92000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Un plombier passe demain matin.'),
  ('92000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Devis chauffage reçu, je vous l''envoie.'),
  ('92000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222221', 'Merci, validez si le montant est correct.');

-- --- Réactivation des triggers ----------------------------------------------
alter table public.profiles   enable trigger trg_protect_profile_role;
alter table public.properties enable trigger trg_audit_properties;
alter table public.leases     enable trigger trg_audit_leases;
alter table public.rent_charges enable trigger trg_audit_charges;
alter table public.payments   enable trigger trg_audit_payments;
alter table public.payment_allocations enable trigger trg_audit_allocations;
alter table public.issues     enable trigger trg_audit_issues;
alter table public.documents  enable trigger trg_audit_documents;

commit;

-- =============================================================================
-- COMMENT TESTER LA RLS
-- =============================================================================
-- La RLS se teste en simulant un utilisateur connecté. Dans psql, ouvre une
-- transaction, prends le rôle "authenticated" et injecte le claim JWT "sub"
-- (c'est ce que lit auth.uid()).
--
-- ---- En tant que OWNER A (ne doit voir que P1, P2, P4) ----------------------
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222221"}';
--   select reference, title from properties order by reference;   -- FER-001, 002, 004
--   rollback;
--
-- ---- En tant que TENANT 1 (ne doit voir que P1 + son bail L1) ---------------
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333331"}';
--   select reference from properties;                 -- FER-001 uniquement
--   select id, rent_amount from leases;               -- L1 uniquement
--   select label, amount from rent_charges;           -- échéances de L1 uniquement
--   rollback;
--
-- ---- En tant que ADMIN (voit tout) -----------------------------------------
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
--   select count(*) from properties;                  -- 5
--   select count(*) from payments;                    -- 7
--   rollback;
--
-- ---- En tant que PUBLIC / anon (annonces uniquement) -----------------------
--   begin;
--   set local role anon;
--   select reference, title from public_listings order by reference;  -- FER-002, FER-005
--   select count(*) from property_photos;             -- 3 (photos des biens publics)
--   -- select * from properties;   -- DOIT échouer / renvoyer 0 ligne (pas d'accès direct)
--   rollback;
-- =============================================================================
