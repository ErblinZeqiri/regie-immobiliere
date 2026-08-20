'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LMap, Marker } from 'leaflet'
import { KOSOVO_CENTER } from '@/lib/kosovo'
import { KOSOVO_GEOJSON, KOSOVO_RINGS_LATLNG, KOSOVO_BOUNDS } from '@/lib/kosovo-geo'

export interface MapPoint {
  id: string
  latitude: number | null
  longitude: number | null
  price: number | null
}

/** Vue imposée (ville + rayon) — prioritaire sur l'ajustement auto aux résultats. */
export interface MapView {
  center: [number, number]
  zoom: number
}

// Anneau « monde » pour voiler tout ce qui est hors Kosovo (Kosovo = trou).
const WORLD_RING: [number, number][] = [
  [85, -179],
  [85, 179],
  [-85, 179],
  [-85, -179],
]

const eur0 = (v: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)

/** Libellé HTML d'un pin (pastille prix vert, ou point si prix sur demande). */
function pinHtml(price: number | null, active: boolean) {
  const cls = `map-pin${active ? ' map-pin--active' : ''}`
  const inner = price != null ? `${eur0(price)}&nbsp;€` : '•'
  return `<div class="${cls}">${inner}</div>`
}

/**
 * Carte Leaflet + fond CARTO Positron (clair, sobre — accordé à la DA).
 * Pins synchronisés avec la liste (survol/clic dans les deux sens) et, en option,
 * mise en focus du Kosovo : contour vert + voile sur les pays voisins.
 */
export function ListingMap({
  points,
  activeId,
  focusId = null,
  view = null,
  countryMask = false,
  onSelect,
  onHover,
}: {
  points: MapPoint[]
  activeId: string | null
  /** Pin à recentrer (clic explicite dans la liste) — pas au survol. */
  focusId?: string | null
  /** Vue imposée par le filtre ville/rayon. */
  view?: MapView | null
  /** Contour du Kosovo + voile sur les voisins, et cadrage pays par défaut. */
  countryMask?: boolean
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LMap | null>(null)
  const markersRef = useRef<Record<string, Marker>>({})
  const LRef = useRef<typeof import('leaflet') | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)
  const coordsRef = useRef<[number, number][]>([])
  const applyViewRef = useRef<() => void>(() => {})
  const [ready, setReady] = useState(false)
  // Refs « live » pour que les callbacks (handlers Leaflet, resize) lisent les
  // dernières props sans recréer la carte.
  const onSelectRef = useRef(onSelect)
  const onHoverRef = useRef(onHover)
  onSelectRef.current = onSelect
  onHoverRef.current = onHover

  // Cadre la carte selon la priorité : ville imposée → pays → résultats.
  const applyView = () => {
    const map = mapRef.current
    if (!map) return
    if (view) {
      map.setView(view.center, view.zoom, { animate: true })
    } else if (countryMask) {
      map.fitBounds(KOSOVO_BOUNDS, { padding: [24, 24] })
    } else if (coordsRef.current.length > 0) {
      map.fitBounds(coordsRef.current, { padding: [50, 50], maxZoom: 15 })
    }
  }
  applyViewRef.current = applyView

  // Init de la carte (une fois).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const mod = await import('leaflet')
      const L = ((mod as unknown as { default?: typeof import('leaflet') }).default ??
        mod) as typeof import('leaflet')
      if (cancelled || !elRef.current || mapRef.current) return
      LRef.current = L
      const map = L.map(elRef.current, {
        scrollWheelZoom: false,
        zoomControl: true,
        attributionControl: true,
      }).setView(view?.center ?? KOSOVO_CENTER, view?.zoom ?? 8)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19,
      }).addTo(map)

      // Focus Kosovo : masque INVERSÉ (monde troué de la géométrie réelle du
      // Kosovo) qui grise les voisins, + contour vert net via la même géométrie.
      if (countryMask) {
        L.polygon([WORLD_RING, ...KOSOVO_RINGS_LATLNG], {
          stroke: false,
          fillColor: '#c9c4ba',
          fillOpacity: 0.55,
          interactive: false,
        }).addTo(map)
        L.geoJSON(KOSOVO_GEOJSON, {
          interactive: false,
          style: {
            color: '#1F4D3A',
            weight: 2,
            opacity: 0.9,
            fill: true,
            fillColor: '#1F4D3A',
            fillOpacity: 0.05,
          },
        }).addTo(map)
      }

      mapRef.current = map
      const ro = new ResizeObserver(() => {
        map.invalidateSize()
        applyViewRef.current()
      })
      ro.observe(elRef.current)
      roRef.current = ro
      setTimeout(() => map.invalidateSize(), 60)
      setReady(true)
    })()
    return () => {
      cancelled = true
      roRef.current?.disconnect()
      roRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
      markersRef.current = {}
    }
  }, [])

  // (Re)dessine les marqueurs quand la sélection filtrée change, puis recadre.
  const key = points.map((p) => p.id).join(',')
  useEffect(() => {
    const L = LRef.current
    const map = mapRef.current
    if (!L || !map) return

    for (const m of Object.values(markersRef.current)) m.remove()
    markersRef.current = {}

    const coords: [number, number][] = []
    for (const p of points) {
      if (p.latitude == null || p.longitude == null) continue
      const latlng: [number, number] = [p.latitude, p.longitude]
      coords.push(latlng)
      const marker = L.marker(latlng, {
        icon: L.divIcon({
          html: pinHtml(p.price, p.id === activeId),
          className: 'map-pin-wrap',
          iconSize: [1, 1],
          iconAnchor: [0, 0],
        }),
      })
        .addTo(map)
        .on('click', () => onSelectRef.current(p.id))
        .on('mouseover', () => onHoverRef.current(p.id))
        .on('mouseout', () => onHoverRef.current(null))
      markersRef.current[p.id] = marker
    }
    coordsRef.current = coords
    applyView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, view?.center[0], view?.center[1], view?.zoom])

  // Met à jour le style du pin actif — SANS recentrer (le survol ne bouge pas la carte).
  useEffect(() => {
    for (const [id, marker] of Object.entries(markersRef.current)) {
      const el = marker.getElement()?.querySelector('.map-pin')
      if (!el) continue
      el.classList.toggle('map-pin--active', id === activeId)
    }
  }, [activeId])

  // Recentre uniquement sur sélection explicite (clic d'un pin ou d'une carte).
  useEffect(() => {
    const map = mapRef.current
    const marker = focusId ? markersRef.current[focusId] : null
    if (map && marker) map.panTo(marker.getLatLng(), { animate: true })
  }, [focusId])

  return <div ref={elRef} className="h-full w-full" aria-label="Carte des annonces" />
}
