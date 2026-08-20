import { createUserClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ValidatePaymentButton } from '@/components/validate-payment-button'

export const dynamic = 'force-dynamic'

const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

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

  const [total, rented, vacant, pending] = await Promise.all([
    supabase.from('properties').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'rented').is('deleted_at', null),
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'available').is('deleted_at', null),
    supabase.from('payments').select('*', { count: 'exact', head: true }).eq('status', 'pending').is('deleted_at', null),
  ])

  const { data: pendingRaw } = await supabase
    .from('payments')
    .select('id, amount, payment_date, reference, method, lease:leases(property:properties(reference, title), tenant:profiles(full_name))')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('payment_date', { ascending: true })
  const pendingPayments = (pendingRaw ?? []) as unknown as PendingPaymentRow[]

  const { data: dueRaw } = await supabase
    .from('rent_charges')
    .select('id, label, due_date, amount, lease:leases(property:properties(reference, title), tenant:profiles(full_name))')
    .eq('status', 'active')
    .lt('due_date', today)
    .is('deleted_at', null)
    .order('due_date', { ascending: true })
  const dueCharges = (dueRaw ?? []) as unknown as DueChargeRow[]

  const chargeIds = dueCharges.map((c) => c.id)
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

function party(p: Party | null) {
  return { ref: p?.property?.reference ?? p?.property?.title ?? '—', tenant: p?.tenant?.full_name ?? '—' }
}

function Section({
  title,
  count,
  tone = 'default',
  children,
}: {
  title: string
  count: number
  tone?: 'default' | 'warning' | 'danger'
  children: React.ReactNode
}) {
  const dot = tone === 'danger' ? 'bg-destructive' : tone === 'warning' ? 'bg-amber-500' : 'bg-muted-foreground/50'
  return (
    <section className="flex flex-col">
      <div className="mb-2.5 flex items-center gap-2">
        <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <span className="rounded bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      {children}
    </section>
  )
}

function MiniStat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: React.ReactNode
  tone?: 'default' | 'warning'
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('amount text-xl', tone === 'warning' ? 'text-amber-600' : 'text-foreground')}>
        {value}
      </span>
    </div>
  )
}

function PartyLine({ tenant, refCode }: { tenant: string; refCode: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="truncate text-sm font-medium">{tenant}</span>
      <Badge variant="outline" className="shrink-0">{refCode}</Badge>
    </div>
  )
}

export default async function AdminDashboardPage() {
  const { kpis, pendingPayments, overdue } = await getDashboardData()

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Vue d’ensemble de la régie</p>
      </div>

      {/* Composition asymétrique : métrique clé en avant + stats secondaires empilées */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col justify-between rounded-[10px] border bg-card p-6 lg:col-span-2">
          <div className="flex items-start justify-between">
            <p className="stat-label">Loyers en retard</p>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {kpis.overdueCount}
            </span>
          </div>
          <div className="mt-6">
            <p
              className={cn(
                'amount text-[2.75rem] leading-none font-bold sm:text-5xl',
                kpis.overdueCount > 0 ? 'text-destructive' : 'text-success',
              )}
            >
              {eur(kpis.overdueTotal)}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {kpis.overdueCount > 0
                ? `Réparti sur ${kpis.overdueCount} échéance${kpis.overdueCount > 1 ? 's' : ''} échue${kpis.overdueCount > 1 ? 's' : ''} non soldée${kpis.overdueCount > 1 ? 's' : ''}.`
                : 'Tous les loyers sont à jour.'}
            </p>
          </div>
        </div>

        <div className="grid grid-rows-3 divide-y overflow-hidden rounded-[10px] border bg-card">
          <MiniStat label="Biens gérés" value={kpis.total} />
          <MiniStat label="Loués / Vacants" value={`${kpis.rented} / ${kpis.vacant}`} />
          <MiniStat
            label="À valider"
            value={kpis.pending}
            tone={kpis.pending > 0 ? 'warning' : 'default'}
          />
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Section title="Paiements en attente" count={pendingPayments.length} tone="warning">
          {pendingPayments.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Aucun paiement en attente.
            </p>
          ) : (
            <div className="divide-y overflow-hidden rounded-xl border bg-card">
              {pendingPayments.map((p) => {
                const { ref, tenant } = party(p.lease)
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 space-y-0.5">
                      <PartyLine tenant={tenant} refCode={ref} />
                      <p className="truncate text-xs text-muted-foreground">
                        {p.payment_date}
                        {p.method ? ` · ${p.method}` : ''}
                        {p.reference ? ` · réf. ${p.reference}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="amount text-sm">{eur(p.amount)}</span>
                      <ValidatePaymentButton paymentId={p.id} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        <Section title="Loyers en retard" count={overdue.length} tone="danger">
          {overdue.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Aucun loyer en retard.
            </p>
          ) : (
            <div className="divide-y overflow-hidden rounded-xl border bg-card">
              {overdue.map((c) => {
                const { ref, tenant } = party(c.lease)
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 space-y-0.5">
                      <PartyLine tenant={tenant} refCode={ref} />
                      <p className="truncate text-xs text-muted-foreground">
                        {c.label ?? 'Échéance'} · {c.due_date}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="amount text-base text-destructive">{eur(c.remaining)}</span>
                      <Badge variant="destructive">Retard</Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
