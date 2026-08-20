'use client'

import { ListingMap } from '@/components/listing-map'

/** Carte de localisation (lecture seule) pour la page détail d'une annonce. */
export function PropertyMiniMap({
  id,
  latitude,
  longitude,
  price,
}: {
  id: string
  latitude: number | null
  longitude: number | null
  price: number | null
}) {
  if (latitude == null || longitude == null) return null
  return (
    <div className="h-64 overflow-hidden rounded-[10px] border border-border">
      <ListingMap
        points={[{ id, latitude, longitude, price }]}
        activeId={id}
        onSelect={() => {}}
        onHover={() => {}}
      />
    </div>
  )
}
