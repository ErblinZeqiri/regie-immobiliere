-- =============================================================================
-- Annonces enrichies : quartier, prix affiché et géolocalisation
-- -----------------------------------------------------------------------------
-- Ajoute les colonnes nécessaires à la vitrine publique (filtres avancés + carte
-- interactive) puis étend la vue `public_listings` en conséquence.
-- Idempotent : ré-exécutable sans erreur.
-- =============================================================================

alter table public.properties
  add column if not exists neighborhood text,               -- quartier / zone de Ferizaj
  add column if not exists price        numeric(10,2),      -- loyer mensuel affiché (EUR)
  add column if not exists latitude     numeric(9,6),
  add column if not exists longitude    numeric(9,6);

comment on column public.properties.neighborhood is 'Quartier / zone (Ferizaj). Utilisé pour le filtre des annonces.';
comment on column public.properties.price        is 'Loyer mensuel affiché sur l''annonce (EUR).';

-- La vue expose les nouvelles colonnes safe. DROP + CREATE (CREATE OR REPLACE ne
-- peut pas insérer des colonnes au milieu d'une vue existante).
drop view if exists public.public_listings;
create view public.public_listings as
  select
    id, reference, title, description, address, city, neighborhood, type,
    surface, rooms, floor, price, latitude, longitude, created_at
  from public.properties
  where is_public = true and status = 'available' and deleted_at is null;
grant select on public.public_listings to anon, authenticated;
