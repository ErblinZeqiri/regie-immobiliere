import { createUserClient } from '@/lib/supabase/server'
import { PropertyCard, type PropertyCardData } from '@/components/property-card'

// Page publique : régénérée périodiquement (ISR). Les URLs signées des photos
// vivent 1 h, donc un cache court de 60 s est sans risque.
export const revalidate = 60

export const metadata = {
  title: 'Appartements à louer à Ferizaj | Régie',
  description: 'Découvrez nos appartements disponibles à la location à Ferizaj.',
}

const PROPERTY_PHOTOS_BUCKET = 'property-photos'
const SIGNED_URL_TTL = 60 * 60 // 1 h

/**
 * Récupère les annonces publiques + une URL signée pour la photo de couverture.
 *
 * SÉCURITÉ : on utilise le client UTILISATEUR (ici sans session = rôle anon).
 *  - `public_listings` est une VUE qui n'expose que des colonnes safe (jamais
 *    owner_id) et n'a que les biens is_public + available.
 *  - `property_photos` est lisible par anon uniquement pour les biens publics
 *    (policy RLS) — cohérent avec les annonces.
 *  - Les fichiers sont dans un bucket PRIVÉ : on génère des URLs signées à durée
 *    courte plutôt que d'exposer des URLs publiques permanentes.
 */
async function getListings(): Promise<PropertyCardData[]> {
  const supabase = await createUserClient()

  // 1. Les annonces (vue publique)
  const { data: listings, error } = await supabase
    .from('public_listings')
    .select('id, reference, title, description, address, city, type, surface, rooms, floor')
    .order('created_at', { ascending: false })

  if (error) throw error
  if (!listings || listings.length === 0) return []

  // 2. Les photos des biens concernés (couverture prioritaire)
  const ids = listings.map((l) => l.id)
  const { data: photos } = await supabase
    .from('property_photos')
    .select('property_id, file_url, is_cover, sort_order')
    .in('property_id', ids)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  const coverPath = new Map<string, string>()
  for (const p of photos ?? []) {
    // Première photo par sort_order, sauf si une is_cover la remplace.
    if (!coverPath.has(p.property_id) || p.is_cover) {
      coverPath.set(p.property_id, p.file_url)
    }
  }

  // 3. URL signée par bien (dégrade proprement en placeholder si absent/erreur)
  return Promise.all(
    listings.map(async (l): Promise<PropertyCardData> => {
      let imageUrl: string | null = null
      const path = coverPath.get(l.id)
      if (path) {
        const { data } = await supabase.storage
          .from(PROPERTY_PHOTOS_BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL)
        imageUrl = data?.signedUrl ?? null
      }
      return { ...l, imageUrl }
    }),
  )
}

export default async function AnnoncesPage() {
  const listings = await getListings()

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Appartements à louer</h1>
        <p className="mt-2 text-muted-foreground">
          {listings.length > 0
            ? `${listings.length} bien${listings.length > 1 ? 's' : ''} disponible${
                listings.length > 1 ? 's' : ''
              } à Ferizaj`
            : 'Nos biens disponibles à Ferizaj'}
        </p>
      </header>

      {listings.length === 0 ? (
        <div className="rounded-lg border border-dashed py-20 text-center">
          <p className="text-lg font-medium">Aucune annonce disponible pour le moment</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Revenez bientôt, de nouveaux biens sont ajoutés régulièrement.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      )}
    </main>
  )
}
