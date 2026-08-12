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
