import Link from 'next/link'
import { createUserClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

interface ChargeRow {
  id: string
  label: string | null
  due_date: string
  amount: string
  lease: {
    property_id: string
    property: { reference: string | null; title: string } | null
    tenant: { full_name: string | null } | null
  } | null
}
interface PaymentRow {
  id: string
  amount: string
  payment_date: string
  status: string
  lease: { property_id: string; property: { reference: string | null } | null } | null
}

async function getData(bien?: string) {
  const supabase = await createUserClient()
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const monthStart = `${now.toISOString().slice(0, 7)}-01`
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)

  const { data: propsRaw } = await supabase
    .from('properties')
    .select('id, reference, title')
    .is('deleted_at', null)
    .order('reference', { ascending: true })
  const properties = (propsRaw ?? []) as { id: string; reference: string | null; title: string }[]

  const { data: chargesRaw } = await supabase
    .from('rent_charges')
    .select('id, label, due_date, amount, lease:leases(property_id, property:properties(reference, title), tenant:profiles(full_name))')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('due_date', { ascending: false })
  let charges = (chargesRaw ?? []) as unknown as ChargeRow[]
  if (bien) charges = charges.filter((c) => c.lease?.property_id === bien)

  const alloc = new Map<string, number>()
  if (charges.length > 0) {
    const { data: a } = await supabase.from('payment_allocations').select('rent_charge_id, amount').in('rent_charge_id', charges.map((c) => c.id))
    for (const x of a ?? []) alloc.set(x.rent_charge_id, (alloc.get(x.rent_charge_id) ?? 0) + Number(x.amount))
  }
  const echeances = charges.map((c) => {
    const remaining = Math.round((Number(c.amount) - (alloc.get(c.id) ?? 0)) * 100) / 100
    return { ...c, remaining, overdue: remaining > 0.005 && c.due_date < today }
  })
  const overdueTotal = echeances.filter((e) => e.overdue).reduce((s, e) => s + e.remaining, 0)

  const { data: paysRaw } = await supabase
    .from('payments')
    .select('id, amount, payment_date, status, lease:leases(property_id, property:properties(reference))')
    .is('deleted_at', null)
    .order('payment_date', { ascending: false })
    .limit(40)
  let payments = (paysRaw ?? []) as unknown as PaymentRow[]
  if (bien) payments = payments.filter((p) => p.lease?.property_id === bien)

  const collectedThisMonth = payments
    .filter((p) => p.status === 'validated' && p.payment_date >= monthStart && p.payment_date < nextMonthStart)
    .reduce((s, p) => s + Number(p.amount), 0)

  return { properties, echeances, overdueTotal, collectedThisMonth, payments: payments.slice(0, 12) }
}

export default async function OwnerLoyersPage({ searchParams }: { searchParams: Promise<{ bien?: string }> }) {
  const { bien } = await searchParams
  const { properties, echeances, overdueTotal, collectedThisMonth, payments } = await getData(bien)
  const current = bien ? properties.find((p) => p.id === bien) : null

  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Loyers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Encaissements et retards{current ? ` — ${current.reference ?? current.title}` : ' sur l’ensemble de vos biens'}.
        </p>
      </header>

      {/* Résumé */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="kpi-card">
          <CardHeader className="pb-2"><CardDescription className="stat-label">Encaissé ce mois</CardDescription>
            <CardTitle className="amount text-3xl text-success">{eur(collectedThisMonth)}</CardTitle></CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">Paiements validés du mois en cours.</CardContent>
        </Card>
        <Card className="kpi-card">
          <CardHeader className="pb-2"><CardDescription className="stat-label">Total en retard</CardDescription>
            <CardTitle className={cn('amount text-3xl', overdueTotal > 0.005 ? 'text-destructive' : 'text-success')}>{eur(overdueTotal)}</CardTitle></CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {overdueTotal > 0.005 ? 'Échéances échues non soldées.' : 'Tous les loyers sont à jour.'}
          </CardContent>
        </Card>
      </div>

      {/* Filtre par bien */}
      {properties.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip href="/proprietaire/loyers" active={!bien}>Tous</FilterChip>
          {properties.map((p) => (
            <FilterChip key={p.id} href={`/proprietaire/loyers?bien=${p.id}`} active={bien === p.id}>
              {p.reference ?? p.title}
            </FilterChip>
          ))}
        </div>
      )}

      {/* Échéances */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Échéances</h2>
        {echeances.length === 0 ? (
          <Empty>Aucune échéance.</Empty>
        ) : (
          <Card><CardContent className="divide-y p-0">
            {echeances.slice(0, 20).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{e.label ?? 'Échéance'}</span>
                    {e.lease?.property?.reference && <Badge variant="outline">{e.lease.property.reference}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {e.lease?.tenant?.full_name ?? '—'} · échéance au {e.due_date}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={cn('amount text-sm', e.remaining > 0.005 ? 'text-foreground' : 'text-muted-foreground')}>
                    {e.remaining > 0.005 ? eur(e.remaining) : eur(e.amount)}
                  </span>
                  {e.remaining <= 0.005 ? (
                    <Badge className="border-success/25 bg-success/10 text-success">Soldée</Badge>
                  ) : e.overdue ? (
                    <Badge variant="destructive">En retard</Badge>
                  ) : (
                    <Badge variant="outline">À échoir</Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent></Card>
        )}
      </section>

      {/* Paiements récents */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Paiements récents</h2>
        {payments.length === 0 ? (
          <Empty>Aucun paiement.</Empty>
        ) : (
          <Card><CardContent className="divide-y p-0">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="amount text-sm">{eur(p.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.payment_date}{p.lease?.property?.reference ? ` · ${p.lease.property.reference}` : ''}
                  </p>
                </div>
                {p.status === 'validated' ? (
                  <Badge className="border-success/25 bg-success/10 text-success">Validé</Badge>
                ) : p.status === 'pending' ? (
                  <Badge className="border-amber-500/25 bg-amber-500/10 text-amber-600">En attente</Badge>
                ) : (
                  <Badge variant="destructive">Rejeté</Badge>
                )}
              </div>
            ))}
          </CardContent></Card>
        )}
      </section>
    </div>
  )
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent',
      )}
    >
      {children}
    </Link>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[10px] border border-dashed py-10 text-center text-sm text-muted-foreground">{children}</div>
}
