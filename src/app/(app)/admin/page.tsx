import { AlertTriangle, Clock } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ValidatePaymentButton } from '@/components/validate-payment-button'

// Toujours des données fraîches (KPIs financiers).
export const dynamic = 'force-dynamic'

const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

// --- Formes des lignes (embeds Supabase, castées) --------------------------
interface Party {
  property: { reference: string | null; title: string } | null
  tenant: { full_name: string | null } | null
}
interface PendingPaymentRow {
  id: string
  amount: string
  payment_date: string
  reference: string | null
  method: string | null
  lease: Party | null
}
interface DueChargeRow {
  id: string
  label: string | null
  due_date: string
  amount: string
  lease: Party | null
}

async function getDashboardData() {
  const supabase = await createUserClient()
  const today = new Date().toISOString().slice(0, 10)

  // --- KPIs (compte exact, sans ramener les lignes) ------------------------
  const [total, rented, vacant, pending] = await Promise.all([
    supabase.from('properties').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase
      .from('properties')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'rented')
      .is('deleted_at', null),
    supabase
      .from('properties')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'available')
      .is('deleted_at', null),
    supabase
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .is('deleted_at', null),
  ])

  // --- Paiements en attente de validation ----------------------------------
  const { data: pendingRaw } = await supabase
    .from('payments')
    .select(
      'id, amount, payment_date, reference, method, lease:leases(property:properties(reference, title), tenant:profiles(full_name))',
    )
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('payment_date', { ascending: true })
  const pendingPayments = (pendingRaw ?? []) as unknown as PendingPaymentRow[]

  // --- Loyers en retard : échéances actives, échues, non soldées -----------
  const { data: dueRaw } = await supabase
    .from('rent_charges')
    .select(
      'id, label, due_date, amount, lease:leases(property:properties(reference, title), tenant:profiles(full_name))',
    )
    .eq('status', 'active')
    .lt('due_date', today)
    .is('deleted_at', null)
    .order('due_date', { ascending: true })
  const dueCharges = (dueRaw ?? []) as unknown as DueChargeRow[]

  // Solde restant = montant - somme des allocations (calculé côté serveur).
  const chargeIds = dueCharges.map((c) => c.id)
  const allocByCharge = new Map<string, number>()
  if (chargeIds.length > 0) {
    const { data: allocs } = await supabase
      .from('payment_allocations')
      .select('rent_charge_id, amount')
      .in('rent_charge_id', chargeIds)
    for (const a of allocs ?? []) {
      allocByCharge.set(
        a.rent_charge_id,
        (allocByCharge.get(a.rent_charge_id) ?? 0) + Number(a.amount),
      )
    }
  }
  const overdue = dueCharges
    .map((c) => ({ ...c, remaining: Number(c.amount) - (allocByCharge.get(c.id) ?? 0) }))
    .filter((c) => c.remaining > 0.005)

  const overdueTotal = overdue.reduce((s, c) => s + c.remaining, 0)

  return {
    kpis: {
      total: total.count ?? 0,
      rented: rented.count ?? 0,
      vacant: vacant.count ?? 0,
      pending: pending.count ?? 0,
      overdueCount: overdue.length,
      overdueTotal,
    },
    pendingPayments,
    overdue,
  }
}

function partyLine(p: Party | null) {
  const ref = p?.property?.reference ?? p?.property?.title ?? '—'
  const tenant = p?.tenant?.full_name ?? '—'
  return { ref, tenant }
}

export default async function AdminDashboardPage() {
  const { kpis, pendingPayments, overdue } = await getDashboardData()

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">Vue d’ensemble de la régie.</p>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Biens" value={kpis.total} />
        <StatCard
          label="Loués / Vacants"
          value={`${kpis.rented} / ${kpis.vacant}`}
          hint="occupés / disponibles"
        />
        <StatCard
          label="Paiements en attente"
          value={kpis.pending}
          hint={kpis.pending > 0 ? 'à valider' : 'rien à valider'}
          tone={kpis.pending > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Loyers en retard"
          value={kpis.overdueCount}
          hint={kpis.overdueCount > 0 ? eur(kpis.overdueTotal) + ' dus' : 'à jour'}
          tone={kpis.overdueCount > 0 ? 'danger' : 'default'}
        />
      </section>

      {/* Paiements en attente */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-600" aria-hidden />
          <h2 className="text-lg font-semibold">Paiements en attente de validation</h2>
        </div>

        {pendingPayments.length === 0 ? (
          <EmptyState message="Aucun paiement en attente." />
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {pendingPayments.map((p) => {
                const { ref, tenant } = partyLine(p.lease)
                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{tenant}</span>
                        <Badge variant="outline">{ref}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {eur(p.amount)} · {p.payment_date}
                        {p.method ? ` · ${p.method}` : ''}
                        {p.reference ? ` · réf. ${p.reference}` : ''}
                      </p>
                    </div>
                    <ValidatePaymentButton paymentId={p.id} />
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Loyers en retard */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
          <h2 className="text-lg font-semibold">Loyers en retard</h2>
        </div>

        {overdue.length === 0 ? (
          <EmptyState message="Aucun loyer en retard. 🎉" />
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {overdue.map((c) => {
                const { ref, tenant } = partyLine(c.lease)
                return (
                  <div
                    key={c.id}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{tenant}</span>
                        <Badge variant="outline">{ref}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {c.label ?? 'Échéance'} · échéance du {c.due_date}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="amount text-base">{eur(c.remaining)}</span>
                      <Badge variant="destructive">En retard</Badge>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}

// --- Petits composants locaux ----------------------------------------------
function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'default' | 'warning' | 'danger'
}) {
  const valueColor =
    tone === 'danger'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-amber-600'
        : 'text-foreground'
  return (
    <Card className="kpi-card">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`amount text-3xl font-bold ${valueColor}`}>{value}</CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      )}
    </Card>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}
