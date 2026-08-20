import { Clock } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { monthLabelFr } from '@/lib/server-helpers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoyersMonthNav } from '@/components/loyers-month-nav'
import { GenerateChargesButton } from '@/components/generate-charges-button'
import { ValidatePaymentButton } from '@/components/validate-payment-button'

export const dynamic = 'force-dynamic'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

interface Party {
  property: { reference: string | null } | null
  tenant: { full_name: string | null } | null
}
interface ChargeRow {
  id: string
  label: string | null
  due_date: string
  amount: string
  lease: Party | null
}
interface PendingRow {
  id: string
  amount: string
  payment_date: string
  reference: string | null
  method: string | null
  lease: Party | null
}

function ChargeStatus({ remaining, amount, overdue }: { remaining: number; amount: number; overdue: boolean }) {
  if (remaining <= 0.005) return <Badge className="border-success/25 bg-success/10 text-success">Soldée</Badge>
  if (overdue) return <Badge variant="destructive">En retard</Badge>
  if (remaining < amount - 0.005)
    return <Badge variant="outline" className="border-amber-500 text-amber-600">Partielle</Badge>
  return <Badge variant="outline">À venir</Badge>
}

export default async function AdminLoyersPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>
}) {
  const { mois } = await searchParams
  const month = mois && MONTH_RE.test(mois) ? mois : new Date().toISOString().slice(0, 7)
  const period = `${month}-01`
  const today = new Date().toISOString().slice(0, 10)

  const supabase = await createUserClient()

  // Échéances de la période (tous baux)
  const { data: chargesRaw } = await supabase
    .from('rent_charges')
    .select(
      'id, label, due_date, amount, lease:leases(property:properties(reference), tenant:profiles(full_name))',
    )
    .eq('period', period)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('due_date', { ascending: true })
  const charges = (chargesRaw ?? []) as unknown as ChargeRow[]

  // Allocations pour calculer le reste dû
  const chargeIds = charges.map((c) => c.id)
  const allocByCharge = new Map<string, number>()
  if (chargeIds.length > 0) {
    const { data: allocs } = await supabase
      .from('payment_allocations')
      .select('rent_charge_id, amount')
      .in('rent_charge_id', chargeIds)
    for (const a of allocs ?? []) {
      allocByCharge.set(a.rent_charge_id, (allocByCharge.get(a.rent_charge_id) ?? 0) + Number(a.amount))
    }
  }

  let attendu = 0
  let resteDu = 0
  const enriched = charges.map((c) => {
    const amount = Number(c.amount)
    const remaining = amount - (allocByCharge.get(c.id) ?? 0)
    attendu += amount
    if (remaining > 0.005) resteDu += remaining
    return { ...c, amount, remaining, overdue: remaining > 0.005 && c.due_date < today }
  })
  const encaisse = attendu - resteDu

  // Paiements en attente de validation (tous)
  const { data: pendingRaw } = await supabase
    .from('payments')
    .select(
      'id, amount, payment_date, reference, method, lease:leases(property:properties(reference), tenant:profiles(full_name))',
    )
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('payment_date', { ascending: true })
  const pending = (pendingRaw ?? []) as unknown as PendingRow[]

  const partyRef = (p: Party | null) => p?.property?.reference ?? '—'
  const partyTenant = (p: Party | null) => p?.tenant?.full_name ?? '—'

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Loyers</h1>
          <p className="text-sm text-muted-foreground">Suivi des encaissements — {monthLabelFr(month)}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LoyersMonthNav month={month} />
          <GenerateChargesButton defaultMonth={month} hideMonthInput label="Générer ce mois" />
        </div>
      </header>

      {/* Synthèse du mois */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="kpi-card">
          <CardHeader className="pb-2">
            <CardDescription className="stat-label">Attendu</CardDescription>
            <CardTitle className="amount text-3xl font-bold">{eur(attendu)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="kpi-card">
          <CardHeader className="pb-2">
            <CardDescription className="stat-label">Encaissé</CardDescription>
            <CardTitle className="amount text-3xl font-bold text-success">{eur(encaisse)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="kpi-card">
          <CardHeader className="pb-2">
            <CardDescription className="stat-label">Reste dû</CardDescription>
            <CardTitle className={`amount text-3xl font-bold ${resteDu > 0.005 ? 'text-destructive' : 'text-success'}`}>
              {eur(resteDu)}
            </CardTitle>
          </CardHeader>
        </Card>
      </section>

      {/* Paiements en attente */}
      {pending.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" aria-hidden />
            <h2 className="text-lg font-semibold">Paiements en attente de validation</h2>
          </div>
          <Card>
            <CardContent className="divide-y p-0">
              {pending.map((p) => (
                <div key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{partyTenant(p.lease)}</span>
                      <Badge variant="outline">{partyRef(p.lease)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {eur(p.amount)} · {p.payment_date}
                      {p.method ? ` · ${p.method}` : ''}
                      {p.reference ? ` · réf. ${p.reference}` : ''}
                    </p>
                  </div>
                  <ValidatePaymentButton paymentId={p.id} />
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Échéances du mois */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Échéances de {monthLabelFr(month)}</h2>
        {enriched.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            Aucune échéance pour ce mois. Utilisez « Générer ce mois » ci-dessus.
          </div>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Locataire</th>
                    <th className="p-3 font-medium">Bien</th>
                    <th className="p-3 font-medium">Échéance</th>
                    <th className="p-3 font-medium">Montant</th>
                    <th className="p-3 font-medium">Reste dû</th>
                    <th className="p-3 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {enriched.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/40">
                      <td className="p-3 font-medium">{partyTenant(c.lease)}</td>
                      <td className="p-3 text-muted-foreground">{partyRef(c.lease)}</td>
                      <td className="p-3 text-muted-foreground">{c.due_date}</td>
                      <td className="p-3 amount">{eur(c.amount)}</td>
                      <td className="p-3 amount">{eur(Math.max(0, c.remaining))}</td>
                      <td className="p-3">
                        <ChargeStatus remaining={c.remaining} amount={c.amount} overdue={c.overdue} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
