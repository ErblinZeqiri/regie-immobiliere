import Link from 'next/link'
import { Building2, Layers, Maximize2, BedDouble, MapPin } from 'lucide-react'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/** Données d'annonce consommées par la carte (issues de public_listings + photo signée). */
export interface PropertyCardData {
  id: string
  reference: string | null
  title: string
  description: string | null
  address: string | null
  city: string | null
  type: string | null
  surface: string | null // numeric -> string via supabase-js
  rooms: number | null
  floor: number | null
  imageUrl: string | null // URL signée (ou null -> placeholder)
}

const TYPE_LABELS: Record<string, string> = {
  apartment: 'Appartement',
  house: 'Maison',
  commercial: 'Local commercial',
  land: 'Terrain',
  other: 'Autre',
}

export function PropertyCard({ property }: { property: PropertyCardData }) {
  const href = `/annonces/${property.id}`
  const typeLabel = property.type ? (TYPE_LABELS[property.type] ?? property.type) : null

  return (
    <Card className="group overflow-hidden pt-0 ring-foreground/[0.06] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary/25">
      {/* Image cliquable */}
      <Link href={href} className="block">
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          {property.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={property.imageUrl}
              alt={property.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="photo-placeholder h-full w-full">
              <Building2 className="h-12 w-12 opacity-80" aria-hidden strokeWidth={1.25} />
            </div>
          )}

          {typeLabel && (
            <Badge className="absolute left-3 top-3" variant="secondary">
              {typeLabel}
            </Badge>
          )}
          {property.reference && (
            <span className="absolute right-3 top-3 rounded bg-background/80 px-2 py-0.5 text-xs font-medium text-muted-foreground backdrop-blur">
              {property.reference}
            </span>
          )}
        </div>
      </Link>

      <CardContent className="space-y-2">
        <Link href={href}>
          <h3 className="line-clamp-1 font-semibold leading-tight hover:underline">
            {property.title}
          </h3>
        </Link>

        {(property.address || property.city) && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-1">
              {[property.address, property.city].filter(Boolean).join(', ')}
            </span>
          </p>
        )}

        {/* Caractéristiques */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm text-muted-foreground">
          {property.surface && (
            <span className="flex items-center gap-1">
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              {Number(property.surface)} m²
            </span>
          )}
          {property.rooms != null && (
            <span className="flex items-center gap-1">
              <BedDouble className="h-3.5 w-3.5" aria-hidden />
              {property.rooms} {property.rooms > 1 ? 'pièces' : 'pièce'}
            </span>
          )}
          {property.floor != null && (
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" aria-hidden />
              {property.floor === 0 ? 'RDC' : `${property.floor}ᵉ étage`}
            </span>
          )}
        </div>
      </CardContent>

      <CardFooter>
        <Button className="w-full" render={<Link href={href} />}>
          Voir le détail
        </Button>
      </CardFooter>
    </Card>
  )
}
