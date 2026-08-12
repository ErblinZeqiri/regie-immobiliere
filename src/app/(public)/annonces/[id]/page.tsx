import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin, Maximize2, BedDouble, Layers } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PropertyGallery } from '@/components/property-gallery'
import { ApplicationForm } from '@/components/application-form'

export const revalidate = 60

const PROPERTY_PHOTOS_BUCKET = 'property-photos'
const SIGNED_URL_TTL = 60 * 60
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TYPE_LABELS: Record<string, string> = {
  apartment: 'Appartement',
  house: 'Maison',
  commercial: 'Local commercial',
  land: 'Terrain',
  other: 'Autre',
}

interface Listing {
  id: string
  reference: string | null
  title: string
  description: string | null
  address: string | null
  city: string | null
  type: string | null
  surface: string | null
  rooms: number | null
  floor: number | null
}

async function getListing(id: string) {
  const supabase = await createUserClient()

  // public_listings ne contient que les biens is_public + available : si l'id
  // n'y est pas (inexistant OU plus disponible), on renvoie null -> 404.
  const { data: property } = await supabase
    .from('public_listings')
    .select('id, reference, title, description, address, city, type, surface, rooms, floor')
    .eq('id', id)
    .maybeSingle()
  if (!property) return null

  // Toutes les photos, couverture en premier
  const { data: photos } = await supabase
    .from('property_photos')
    .select('file_url, is_cover, sort_order')
    .eq('property_id', id)
    .is('deleted_at', null)
    .order('is_cover', { ascending: false })
    .order('sort_order', { ascending: true })

  let images: string[] = []
  const paths = (photos ?? []).map((p) => p.file_url)
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(PROPERTY_PHOTOS_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL)
    images = (signed ?? [])
      .map((s) => s.signedUrl)
      .filter((u): u is string => typeof u === 'string')
  }

  return { property: property as Listing, images }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return { title: 'Annonce introuvable' }
  const data = await getListing(id)
  if (!data) return { title: 'Annonce introuvable' }
  return {
    title: `${data.property.title} | Régie Ferizaj`,
    description: data.property.description ?? undefined,
  }
}

export default async function AnnonceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()

  const data = await getListing(id)
  if (!data) notFound()

  const { property, images } = data
  const typeLabel = property.type ? (TYPE_LABELS[property.type] ?? property.type) : null

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/annonces"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Retour aux annonces
      </Link>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Colonne principale */}
        <div className="space-y-6 lg:col-span-2">
          <PropertyGallery images={images} title={property.title} />

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {typeLabel && <Badge variant="secondary">{typeLabel}</Badge>}
              {property.reference && <Badge variant="outline">{property.reference}</Badge>}
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{property.title}</h1>
              {(property.address || property.city) && (
                <p className="mt-1 flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                  {[property.address, property.city].filter(Boolean).join(', ')}
                </p>
              )}
            </div>

            {/* Caractéristiques */}
            <div className="flex flex-wrap gap-4 rounded-lg border p-4 text-sm">
              {property.surface && (
                <span className="flex items-center gap-2">
                  <Maximize2 className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="font-medium">{Number(property.surface)} m²</span>
                </span>
              )}
              {property.rooms != null && (
                <span className="flex items-center gap-2">
                  <BedDouble className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="font-medium">
                    {property.rooms} {property.rooms > 1 ? 'pièces' : 'pièce'}
                  </span>
                </span>
              )}
              {property.floor != null && (
                <span className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="font-medium">
                    {property.floor === 0 ? 'Rez-de-chaussée' : `${property.floor}ᵉ étage`}
                  </span>
                </span>
              )}
            </div>

            {property.description && (
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">Description</h2>
                <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
                  {property.description}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Colonne contact (sticky sur desktop) */}
        <aside className="lg:col-span-1">
          <div className="lg:sticky lg:top-20">
            <Card>
              <CardHeader>
                <CardTitle>Intéressé par ce bien ?</CardTitle>
                <CardDescription>
                  Laissez vos coordonnées, la régie vous recontacte.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ApplicationForm propertyId={property.id} propertyTitle={property.title} />
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>
    </main>
  )
}
