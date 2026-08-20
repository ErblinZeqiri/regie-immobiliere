import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin, Maximize2, BedDouble, Layers, Building2 } from 'lucide-react'
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
import { PropertyMiniMap } from '@/components/property-mini-map'
import { ApplicationForm } from '@/components/application-form'
import { fallbackImage } from '@/lib/listing-images'

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
  neighborhood: string | null
  type: string | null
  surface: string | null
  rooms: number | null
  floor: number | null
  price: string | null
  latitude: string | null
  longitude: string | null
}

const eur = (v: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v) + ' €'
const n = (v: string | null) => (v == null ? null : Number(v))

async function getListing(id: string) {
  const supabase = await createUserClient()

  const { data: property } = await supabase
    .from('public_listings')
    .select(
      'id, reference, title, description, address, city, neighborhood, type, surface, rooms, floor, price, latitude, longitude',
    )
    .eq('id', id)
    .maybeSingle()
  if (!property) return null

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
    title: `${data.property.title} | Pron Gérance`,
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
  const price = n(property.price)
  const location = [property.neighborhood, property.city].filter(Boolean).join(', ')

  const facts = [
    property.surface && { icon: Maximize2, label: 'Surface', value: `${Number(property.surface)} m²` },
    property.rooms != null && {
      icon: BedDouble,
      label: 'Pièces',
      value: `${property.rooms} ${property.rooms > 1 ? 'pièces' : 'pièce'}`,
    },
    property.floor != null && {
      icon: Layers,
      label: 'Étage',
      value: property.floor === 0 ? 'Rez-de-chaussée' : `${property.floor}ᵉ étage`,
    },
    typeLabel && { icon: Building2, label: 'Type', value: typeLabel },
  ].filter(Boolean) as { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[]

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
          <PropertyGallery
            images={images}
            title={property.title}
            fallback={fallbackImage(property.id, property.type, 1400)}
          />

          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {typeLabel && <Badge variant="secondary">{typeLabel}</Badge>}
              {property.neighborhood && <Badge variant="outline">{property.neighborhood}</Badge>}
              {property.reference && <Badge variant="outline">{property.reference}</Badge>}
            </div>

            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                {property.title}
              </h1>
              {location && (
                <p className="mt-2 flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                  {location}
                  {property.address ? ` — ${property.address}` : ''}
                </p>
              )}
            </div>

            {/* Caractéristiques */}
            <div className="flex flex-wrap gap-px overflow-hidden rounded-[10px] border border-border bg-border">
              {facts.map((f) => (
                <div key={f.label} className="min-w-[130px] flex-1 bg-card px-4 py-4">
                  <f.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {f.label}
                  </p>
                  <p className="mt-0.5 text-sm font-medium">{f.value}</p>
                </div>
              ))}
            </div>

            {property.description && (
              <div className="space-y-2">
                <h2 className="font-display text-lg font-semibold">Description</h2>
                <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
                  {property.description}
                </p>
              </div>
            )}

            {property.latitude && property.longitude && (
              <div className="space-y-2">
                <h2 className="font-display text-lg font-semibold">Localisation</h2>
                <PropertyMiniMap
                  id={property.id}
                  latitude={n(property.latitude)}
                  longitude={n(property.longitude)}
                  price={price}
                />
              </div>
            )}
          </div>
        </div>

        {/* Colonne contact (sticky sur desktop) */}
        <aside className="lg:col-span-1">
          <div className="space-y-4 lg:sticky lg:top-20">
            <Card>
              <CardHeader>
                <CardDescription className="stat-label">Loyer mensuel</CardDescription>
                <CardTitle className="amount text-3xl text-primary">
                  {price != null ? (
                    <>
                      {eur(price)}
                      <span className="text-sm font-normal text-muted-foreground"> /mois</span>
                    </>
                  ) : (
                    <span className="text-lg text-muted-foreground">Sur demande</span>
                  )}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Intéressé par ce bien ?</CardTitle>
                <CardDescription>Laissez vos coordonnées, la régie vous recontacte.</CardDescription>
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
