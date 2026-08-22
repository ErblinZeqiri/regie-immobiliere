import Link from 'next/link'
import { MapPin, ArrowRight } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PropertyStatusBadge } from '@/components/property-status-badge'

export const dynamic = 'force-dynamic'

const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

interface PropertyRow {
  id: string
  reference: string | null
  title: string
  address: string | null
  city: string | null
  type: string | null
  surface: string | null
  rooms: number | null
  status: string
}
interface LeaseRow {
  property_id: string
  rent_amount: string
  charges_amount: string
  tenant: { full_name: string | null } | null
}

const TYPE_LABELS: Record<string, string> = {
  apartment: 'Appartement',
  house: 'Maison',
  commercial: 'Local commercial',
  land: 'Terrain',
  other: 'Autre',
}

async function getData() {
  const supabase = await createUserClient()
  const { data: propsRaw } = await supabase
    .from('properties')
    .select('id, reference, title, address, city, type, surface, rooms, status')
    .is('deleted_at', null)
    .order('reference', { ascending: true })
  const properties = (propsRaw ?? []) as PropertyRow[]

  const leaseByProp = new Map<string, LeaseRow>()
  if (properties.length > 0) {
    const { data: leasesRaw } = await supabase
      .from('leases')
      .select('property_id, rent_amount, charges_amount, tenant:profiles(full_name)')
      .eq('status', 'active')
      .is('deleted_at', null)
      .in('property_id', properties.map((p) => p.id))
    for (const l of (leasesRaw ?? []) as unknown as LeaseRow[]) leaseByProp.set(l.property_id, l)
  }

  return { properties, leaseByProp }
}

export default async function OwnerBiensPage() {
  const { properties, leaseByProp } = await getData()

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Mes biens</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {properties.length} bien{properties.length > 1 ? 's' : ''} — statut, loyer et locataire en cours.
        </p>
      </header>

      {properties.length === 0 ? (
        <div className="rounded-[10px] border border-dashed py-16 text-center text-sm text-muted-foreground">
          Aucun bien enregistré. Contactez la régie.
        </div>
      ) : (
        <div className="grid gap-4">
          {properties.map((p) => {
            const lease = leaseByProp.get(p.id)
            const monthly = lease ? Number(lease.rent_amount) + Number(lease.charges_amount) : null
            return (
              <Link key={p.id} href={`/proprietaire/biens/${p.id}`} className="group block">
                <Card className="transition-colors group-hover:border-primary/40">
                  <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.title}</span>
                        {p.reference && <Badge variant="outline">{p.reference}</Badge>}
                        <PropertyStatusBadge status={p.status} />
                      </div>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        {[p.address, p.city].filter(Boolean).join(', ') || '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.type ? TYPE_LABELS[p.type] ?? p.type : '—'}
                        {p.surface ? ` · ${Number(p.surface)} m²` : ''}
                        {p.rooms != null ? ` · ${p.rooms} pièces` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-6 sm:justify-end">
                      <div className="text-right">
                        {monthly != null ? (
                          <>
                            <p className="amount text-base">{eur(monthly)}<span className="text-xs font-normal text-muted-foreground">/mois</span></p>
                            <p className="text-xs text-muted-foreground">
                              {lease?.tenant?.full_name ?? 'Locataire'}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">Sans bail actif</p>
                        )}
                      </div>
                      <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
