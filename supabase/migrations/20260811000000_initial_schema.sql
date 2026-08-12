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
