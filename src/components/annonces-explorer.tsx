'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Maximize2, BedDouble, Layers, MapPin, SlidersHorizontal, Map as MapIcon, List, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { SimpleSelect } from '@/components/simple-select'
import { SmartImage } from '@/components/smart-image'
import { fallbackImage } from '@/lib/listing-images'
import { cn } from '@/lib/utils'
import { KOSOVO_CITIES, haversineKm, zoomForRadius } from '@/lib/kosovo'
import type { MapPoint, MapView } from '@/components/listing-map'

// Leaflet ne doit tourner que côté client.
const ListingMap = dynamic(() => import('@/components/listing-map').then((m) => m.ListingMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
})

export interface Listing {
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
  imageUrl: string | null
}

const TYPE_LABELS: Record<string, string> = {
  apartment: 'Appartement',
  house: 'Maison',
  commercial: 'Local commercial',
  land: 'Terrain',
  other: 'Autre',
}

const eur = (v: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v) + ' €'

const num = (v: string | null) => (v == null ? null : Number(v))

interface Filters {
  city: string
  radius: string
  type: string
  priceMin: string
  priceMax: string
  surfaceMin: string
  surfaceMax: string
  rooms: string
  floor: string
}

const EMPTY: Filters = {
  city: '',
  radius: '',
  type: '',
  priceMin: '',
  priceMax: '',
  surfaceMin: '',
  surfaceMax: '',
  rooms: '',
  floor: '',
}

function floorLabel(floor: number | null) {
  if (floor == null) return null
  return floor === 0 ? 'RDC' : `${floor}ᵉ ét.`
}

export function AnnoncesExplorer({ listings }: { listings: Listing[] }) {
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [mobileMap, setMobileMap] = useState(false)
  const cardRefs = useRef<Record<string, HTMLElement | null>>({})

  const set = <K extends keyof Filters>(k: K, v: string) =>
    setFilters((f) => ({ ...f, [k]: v }))

  const cityObj = useMemo(
    () => (filters.city ? KOSOVO_CITIES.find((c) => c.name === filters.city) ?? null : null),
    [filters.city],
  )

  const filtered = useMemo(() => {
    const pMin = filters.priceMin ? Number(filters.priceMin) : null
    const pMax = filters.priceMax ? Number(filters.priceMax) : null
    const sMin = filters.surfaceMin ? Number(filters.surfaceMin) : null
    const sMax = filters.surfaceMax ? Number(filters.surfaceMax) : null
    const rMin = filters.rooms ? Number(filters.rooms) : null
    const radiusKm = filters.radius ? Number(filters.radius) : null

    return listings.filter((l) => {
      if (filters.type && l.type !== filters.type) return false

      // Filtre géographique : ville + rayon (haversine) ou, sans rayon, égalité de ville.
      if (cityObj) {
        const lat = num(l.latitude)
        const lng = num(l.longitude)
        if (radiusKm != null) {
          if (lat == null || lng == null) return false
          if (haversineKm([cityObj.lat, cityObj.lng], [lat, lng]) > radiusKm) return false
        } else if ((l.city ?? '') !== cityObj.name) return false
      }

      const price = num(l.price)
      if (pMin != null && (price == null || price < pMin)) return false
      if (pMax != null && (price == null || price > pMax)) return false

      const surface = num(l.surface)
      if (sMin != null && (surface == null || surface < sMin)) return false
      if (sMax != null && (surface == null || surface > sMax)) return false

      if (rMin != null && (l.rooms == null || l.rooms < rMin)) return false

      if (filters.floor) {
        if (l.floor == null) return false
        if (filters.floor === '3plus') {
          if (l.floor < 3) return false
        } else if (l.floor !== Number(filters.floor)) return false
      }
      return true
    })
  }, [listings, filters, cityObj])

  const points: MapPoint[] = useMemo(
    () =>
      filtered.map((l) => ({
        id: l.id,
        latitude: num(l.latitude),
        longitude: num(l.longitude),
        price: num(l.price),
      })),
    [filtered],
  )

  // Vue carte imposée quand une ville est choisie (sinon ajustement auto aux résultats).
  const view: MapView | null = useMemo(
    () =>
      cityObj
        ? { center: [cityObj.lat, cityObj.lng], zoom: zoomForRadius(filters.radius ? Number(filters.radius) : null) }
        : null,
    [cityObj, filters.radius],
  )

  // Un clic sur un pin fait défiler la carte correspondante dans la liste.
  useEffect(() => {
    if (!pinnedId) return
    cardRefs.current[pinnedId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [pinnedId])

  const activeCount = Object.values(filters).filter(Boolean).length
  const reset = () => setFilters(EMPTY)

  const typeOptions = [
    { value: '', label: 'Tous les types' },
    ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
  ]

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-primary uppercase">
          Annonces — Kosovo
        </p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Biens disponibles
          </h1>
          <p className="pb-1 text-sm text-muted-foreground">
            <span className="amount text-foreground">{filtered.length}</span> résultat
            {filtered.length > 1 ? 's' : ''}
          </p>
        </div>
      </header>

      {/* Barre de recherche avancée */}
      <div className="sticky top-16 z-20 mb-6 rounded-[10px] border border-border bg-card/95 p-4 backdrop-blur">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Recherche avancée
          {activeCount > 0 && (
            <button
              onClick={reset}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-primary hover:bg-accent"
            >
              <X className="h-3 w-3" />
              Réinitialiser ({activeCount})
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Ville">
            <SimpleSelect
              value={filters.city}
              onValueChange={(v) => set('city', v)}
              options={[
                { value: '', label: 'Tout le Kosovo' },
                ...KOSOVO_CITIES.map((c) => ({ value: c.name, label: c.name })),
              ]}
            />
          </Field>
          <Field label="Rayon">
            <SimpleSelect
              value={filters.radius}
              onValueChange={(v) => set('radius', v)}
              options={[
                { value: '', label: 'Ville seule' },
                { value: '5', label: '5 km' },
                { value: '10', label: '10 km' },
                { value: '25', label: '25 km' },
                { value: '50', label: '50 km' },
                { value: '100', label: '100 km' },
              ]}
            />
          </Field>
          <Field label="Type">
            <SimpleSelect value={filters.type} onValueChange={(v) => set('type', v)} options={typeOptions} />
          </Field>
          <Field label="Pièces (min)">
            <SimpleSelect
              value={filters.rooms}
              onValueChange={(v) => set('rooms', v)}
              options={[
                { value: '', label: 'Indifférent' },
                { value: '1', label: '1 +' },
                { value: '2', label: '2 +' },
                { value: '3', label: '3 +' },
                { value: '4', label: '4 +' },
              ]}
            />
          </Field>
          <Field label="Étage">
            <SimpleSelect
              value={filters.floor}
              onValueChange={(v) => set('floor', v)}
              options={[
                { value: '', label: 'Tous' },
                { value: '0', label: 'RDC' },
                { value: '1', label: '1er' },
                { value: '2', label: '2e' },
                { value: '3plus', label: '3e et +' },
              ]}
            />
          </Field>
          <Field label="Prix (€/mois)">
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                inputMode="numeric"
                placeholder="min"
                value={filters.priceMin}
                onChange={(e) => set('priceMin', e.target.value)}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="max"
                value={filters.priceMax}
                onChange={(e) => set('priceMax', e.target.value)}
              />
            </div>
          </Field>
          <Field label="Surface (m²)" className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                inputMode="numeric"
                placeholder="min"
                value={filters.surfaceMin}
                onChange={(e) => set('surfaceMin', e.target.value)}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="max"
                value={filters.surfaceMax}
                onChange={(e) => set('surfaceMax', e.target.value)}
              />
            </div>
          </Field>
        </div>
      </div>

      {/* Bascule liste / carte (mobile) */}
      <div className="mb-4 flex gap-2 lg:hidden">
        <ToggleBtn active={!mobileMap} onClick={() => setMobileMap(false)} icon={List}>
          Liste
        </ToggleBtn>
        <ToggleBtn active={mobileMap} onClick={() => setMobileMap(true)} icon={MapIcon}>
          Carte
        </ToggleBtn>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Liste */}
        <div
          className={cn(
            'lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:pr-1',
            mobileMap && 'hidden lg:block',
          )}
        >
          {filtered.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-border py-20 text-center">
              <p className="font-medium">Aucun bien ne correspond à ces critères</p>
              <button onClick={reset} className="mt-2 text-sm text-primary hover:underline">
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  active={activeId === l.id || pinnedId === l.id}
                  onEnter={() => setActiveId(l.id)}
                  onLeave={() => setActiveId(null)}
                  cardRef={(el) => (cardRefs.current[l.id] = el)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Carte */}
        <div
          className={cn(
            'lg:sticky lg:top-20 lg:h-[calc(100vh-5rem)]',
            mobileMap ? 'block' : 'hidden lg:block',
          )}
        >
          <div className="h-[70vh] overflow-hidden rounded-[10px] border border-border lg:h-full">
            <ListingMap
              points={points}
              activeId={activeId ?? pinnedId}
              focusId={pinnedId}
              view={view}
              countryMask
              onSelect={(id) => {
                setPinnedId(id)
                setMobileMap(false)
              }}
              onHover={setActiveId}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function ToggleBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  )
}

function ListingCard({
  listing: l,
  active,
  onEnter,
  onLeave,
  cardRef,
}: {
  listing: Listing
  active: boolean
  onEnter: () => void
  onLeave: () => void
  cardRef: (el: HTMLElement | null) => void
}) {
  const href = `/annonces/${l.id}`
  const typeLabel = l.type ? (TYPE_LABELS[l.type] ?? l.type) : null
  const price = num(l.price)

  return (
    <article
      ref={cardRef}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={cn(
        'group flex flex-col overflow-hidden rounded-[10px] border bg-card transition-all duration-200',
        active ? 'border-primary shadow-md ring-1 ring-primary/30' : 'border-border hover:border-border/80',
      )}
    >
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden">
        <SmartImage
          sources={[l.imageUrl, fallbackImage(l.id, l.type)]}
          alt={l.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        {typeLabel && (
          <span className="absolute left-3 top-3 rounded-md bg-background/90 px-2 py-0.5 text-[11px] font-medium backdrop-blur">
            {typeLabel}
          </span>
        )}
        {l.reference && (
          <span className="absolute right-3 top-3 rounded-md bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur">
            {l.reference}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="amount text-lg text-primary">
            {price != null ? (
              <>
                {eur(price)}
                <span className="text-xs font-normal text-muted-foreground">/mois</span>
              </>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">Sur demande</span>
            )}
          </p>
        </div>

        <Link href={href} className="mt-1">
          <h3 className="line-clamp-1 font-medium leading-tight hover:text-primary">{l.title}</h3>
        </Link>

        {(l.neighborhood || l.city) && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="line-clamp-1">
              {[l.neighborhood, l.city].filter(Boolean).join(', ')}
            </span>
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          {l.surface && (
            <span className="flex items-center gap-1">
              <Maximize2 className="h-3.5 w-3.5" /> {Number(l.surface)} m²
            </span>
          )}
          {l.rooms != null && (
            <span className="flex items-center gap-1">
              <BedDouble className="h-3.5 w-3.5" /> {l.rooms} p.
            </span>
          )}
          {floorLabel(l.floor) && (
            <span className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" /> {floorLabel(l.floor)}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
