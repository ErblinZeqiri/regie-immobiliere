import { createUserClient } from '@/lib/supabase/server'
import { AnnoncesExplorer, type Listing } from '@/components/annonces-explorer'

// Page publique : régénérée périodiquement (ISR). Les URLs signées des photos
// vivent 1 h, donc un cache court de 60 s est sans risque.
export const revalidate = 60

export const metadata = {
  title: 'Biens à louer à Ferizaj | Pron Gérance',
  description:
    'Recherchez un appartement, une maison ou un local à louer à Ferizaj : filtres avancés et carte interactive.',
}

const PROPERTY_PHOTOS_BUCKET = 'property-photos'
const SIGNED_URL_TTL = 60 * 60 // 1 h

/**
 * Récupère les annonces publiques + une URL signée pour la photo de couverture.
 * SÉCURITÉ : client UTILISATEUR (rôle anon) → seules les colonnes safe de la vue
 * `public_listings` (jamais owner_id) et les photos des biens publics sont lues.
 */
async function getListings(): Promise<Listing[]> {
  const supabase = await createUserClient()

  const { data: listings, error } = await supabase
    .from('public_listings')
    .select(
      'id, reference, title, description, address, city, neighborhood, type, surface, rooms, floor, price, latitude, longitude',
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!listings || listings.length === 0) return []

  const ids = listings.map((l) => l.id)
  const { data: photos } = await supabase
    .from('property_photos')
    .select('property_id, file_url, is_cover, sort_order')
    .in('property_id', ids)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  const coverPath = new Map<string, string>()
  for (const p of photos ?? []) {
    if (!coverPath.has(p.property_id) || p.is_cover) coverPath.set(p.property_id, p.file_url)
  }

  return Promise.all(
    listings.map(async (l): Promise<Listing> => {
      let imageUrl: string | null = null
      const path = coverPath.get(l.id)
      if (path) {
        const { data } = await supabase.storage
          .from(PROPERTY_PHOTOS_BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL)
        imageUrl = data?.signedUrl ?? null
      }
      return { ...l, imageUrl } as Listing
    }),
  )
}

export default async function AnnoncesPage() {
  const listings = await getListings()
  return <AnnoncesExplorer listings={listings} />
}
