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
