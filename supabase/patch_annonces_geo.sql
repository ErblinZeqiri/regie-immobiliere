-- =============================================================================
-- PATCH à coller dans l'éditeur SQL Supabase (base déjà seedée)
-- -----------------------------------------------------------------------------
-- 1. Ajoute les colonnes quartier / prix / géo (idempotent)
-- 2. Renseigne les 2 annonces existantes (FER-002, FER-005)
-- 3. Ajoute 5 annonces vitrines supplémentaires pour peupler la carte
-- Ré-exécutable sans danger.
-- =============================================================================

-- 1 + vue -------------------------------------------------------------------
alter table public.properties
  add column if not exists neighborhood text,
  add column if not exists price        numeric(10,2),
  add column if not exists latitude     numeric(9,6),
  add column if not exists longitude    numeric(9,6);

-- DROP + CREATE (et non CREATE OR REPLACE) car on insère des colonnes : Postgres
-- refuse de réordonner les colonnes d'une vue existante.
drop view if exists public.public_listings;
create view public.public_listings as
  select
    id, reference, title, description, address, city, neighborhood, type,
    surface, rooms, floor, price, latitude, longitude, created_at
  from public.properties
  where is_public = true and status = 'available' and deleted_at is null;
grant select on public.public_listings to anon, authenticated;

-- 2. Annonces existantes -----------------------------------------------------
update public.properties set
  neighborhood = 'Centre', price = 230, latitude = 42.371200, longitude = 21.154800
  where id = 'a0000000-0000-0000-0000-000000000002';

update public.properties set
  neighborhood = 'Dardania', price = 430, latitude = 42.366500, longitude = 21.160200
  where id = 'a0000000-0000-0000-0000-000000000005';

-- 3. Annonces vitrines supplémentaires (public + available) -------------------
insert into public.properties
  (id, reference, title, description, address, city, neighborhood, type,
   surface, rooms, floor, price, latitude, longitude, status, is_public, owner_id)
values
  ('a0000000-0000-0000-0000-000000000006', 'FER-006', 'Appartement 3 pièces avec balcon',
   'Séjour lumineux, cuisine équipée et balcon exposé sud. Immeuble récent, proche écoles et commerces.',
   'Rr. Rexhep Bislimi 22', 'Ferizaj', 'Rahovicë', 'apartment',
   85.00, 3, 4, 540, 42.375800, 21.152100, 'available', true, '22222222-2222-2222-2222-222222222221'),

  ('a0000000-0000-0000-0000-000000000007', 'FER-007', 'Maison familiale avec jardin',
   'Maison individuelle sur deux niveaux, jardin clos et garage. Idéale pour une famille, quartier résidentiel calme.',
   'Rr. Ismail Qemali 41', 'Ferizaj', 'Bregu i Diellit', 'house',
   140.00, 5, 0, 780, 42.363100, 21.148700, 'available', true, '22222222-2222-2222-2222-222222222222'),

  ('a0000000-0000-0000-0000-000000000008', 'FER-008', 'Local commercial en centre-ville',
   'Surface commerciale avec vitrine sur rue passante. Fort passage piéton, parfait pour commerce ou bureau.',
   'Rr. Dëshmorët e Kombit 3', 'Ferizaj', 'Centre', 'commercial',
   60.00, null, 0, 650, 42.370500, 21.156000, 'available', true, '22222222-2222-2222-2222-222222222221'),

  ('a0000000-0000-0000-0000-000000000009', 'FER-009', 'Appartement 2 pièces rénové',
   'Entièrement rénové, prêt à emménager. Belle hauteur sous plafond, quartier en plein essor.',
   'Rr. Enver Topalli 28', 'Ferizaj', 'Qendra e re', 'apartment',
   48.00, 2, 3, 360, 42.369900, 21.165500, 'available', true, '22222222-2222-2222-2222-222222222222'),

  ('a0000000-0000-0000-0000-000000000010', 'FER-010', 'Terrain constructible',
   'Parcelle plate et viabilisée en périphérie, accès facile. Certificat d''urbanisme disponible sur demande.',
   'Zona industriale', 'Ferizaj', 'Periferi', 'land',
   520.00, null, null, null, 42.378200, 21.144500, 'available', true, '22222222-2222-2222-2222-222222222221'),

  -- Annonces hors Ferizaj (démontrent le filtre Ville + Rayon) -----------------
  ('a0000000-0000-0000-0000-000000000011', 'PR-001', 'Appartement 3 pièces au centre',
   'Lumineux, proche des commerces et transports. Immeuble bien entretenu, vue dégagée.',
   'Rr. Nëna Terezë 10', 'Prishtinë', 'Qendra', 'apartment',
   70.00, 3, 5, 560, 42.662900, 21.165500, 'available', true, '22222222-2222-2222-2222-222222222221'),

  ('a0000000-0000-0000-0000-000000000012', 'PZ-001', 'Maison de ville avec cour',
   'Maison traditionnelle rénovée avec cour intérieure, dans un quartier calme et central.',
   'Rr. Remzi Ademaj 7', 'Prizren', 'Ortakoll', 'house',
   165.00, 6, 0, 720, 42.213900, 20.739700, 'available', true, '22222222-2222-2222-2222-222222222222'),

  ('a0000000-0000-0000-0000-000000000013', 'GJ-001', 'Appartement 2 pièces rénové',
   'Entièrement rénové, prêt à emménager. Quartier résidentiel proche du centre de Gjilan.',
   'Rr. Idriz Seferi 18', 'Gjilan', 'Qendra', 'apartment',
   55.00, 2, 2, 340, 42.463700, 21.469400, 'available', true, '22222222-2222-2222-2222-222222222221')
on conflict (id) do update set
  neighborhood = excluded.neighborhood,
  price        = excluded.price,
  latitude     = excluded.latitude,
  longitude    = excluded.longitude,
  is_public    = true,
  status       = 'available';
