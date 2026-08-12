import { Home, Wallet } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DeclarePaymentForm } from '@/components/declare-payment-form'

export const dynamic = 'force-dynamic'

const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

interface LeaseRow {
  id: string
  start_date: string
  end_date: string | null
  rent_amount: string
  charges_amount: string
  deposit_amount: string
  property: {
    reference: string | null
    title: string
    address: string | null
    city: string | null
    surface: string | null
    rooms: number | null
    floor: number | null
  } | null
}

async function getTenantData() {
  const supabase = await createUserClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Bail actif (la RLS restreint déjà au locataire courant)
  const { data: leaseRaw } = await supabase
    .from('leases')
    .select(
      'id, start_date, end_date, rent_amount, charges_amount, deposit_amount, property:properties(reference, title, address, city, surface, rooms, floor)',
    )
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lease = leaseRaw as unknown as LeaseRow | null
  if (!lease) return { lease: null }

  const today = new Date().toISOString().slice(0, 10)

  // Échéances actives + allocations -> solde
  const { data: charges } = await supabase
    .from('rent_charges')
    .select('id, label, due_date, amount')
    .eq('lease_id', lease.id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('due_date', { ascending: true })

  const chargeIds = (charges ?? []).map((c) => c.id)
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

  let totalDue = 0
  let overdueDue = 0
  let overdueCount = 0
  for (const c of charges ?? []) {
    const remaining = Number(c.amount) - (allocByCharge.get(c.id) ?? 0)
    if (remaining <= 0.005) continue
    totalDue += remaining
    if (c.due_date < today) {
      overdueDue += remaining
      overdueCount += 1
    }
  }

  // Historique des paiements
  const { data: payments } = await supabase
    .from('payments')
    .select('id, amount, payment_date, method, reference, status')
    .eq('lease_id', lease.id)
    .is('deleted_at', null)
    .order('payment_date', { ascending: false })

  return { lease, totalDue, overdueDue, overdueCount, payments: payments ?? [] }
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'validated')
    return <Badge className="border-transparent bg-green-600 text-white">Validé</Badge>
  if (status === 'pending')
    return <Badge className="border-transparent bg-amber-500 text-white">En attente</Badge>
  return <Badge variant="destructive">Rejeté</Badge>
}

export default async function LocataireDashboardPage() {
  const data = await getTenantData()

  if (!data || !data.lease) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Mon espace</h1>
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Aucun bail actif associé à votre compte. Contactez la régie.
        </div>
      </div>
    )
  }

  const { lease, totalDue, overdueDue, overdueCount, payments } = data
  const monthly = Number(lease.rent_amount) + Number(lease.charges_amount)
  const prop = lease.property

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Mon espace</h1>
        <p className="text-sm text-muted-foreground">Votre bail, votre solde et vos paiements.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Mon logement */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardDescription>Mon logement</CardDescription>
            </div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {prop?.title ?? 'Logement'}
              {prop?.reference && <Badge variant="outline">{prop.reference}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(prop?.address || prop?.city) && (
              <p className="text-muted-foreground">
                {[prop?.address, prop?.city].filter(Boolean).join(', ')}
              </p>
            )}
            <dl className="grid grid-cols-2 gap-y-1">
              <dt className="text-muted-foreground">Loyer</dt>
              <dd className="text-right font-medium">{eur(lease.rent_amount)}</dd>
              <dt className="text-muted-foreground">Charges</dt>
              <dd className="text-right font-medium">{eur(lease.charges_amount)}</dd>
              <dt className="text-muted-foreground">Total mensuel</dt>
              <dd className="text-right font-semibold">{eur(monthly)}</dd>
              <dt className="text-muted-foreground">Dépôt de garantie</dt>
              <dd className="text-right">{eur(lease.deposit_amount)}</dd>
              <dt className="text-muted-foreground">Depuis le</dt>
              <dd className="text-right">{lease.start_date}</dd>
            </dl>
          </CardContent>
        </Card>

        {/* Mon solde */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardDescription>Mon solde</CardDescription>
            </div>
            <CardTitle
              className={`text-3xl ${totalDue > 0.005 ? 'text-destructive' : 'text-green-600'}`}
            >
              {eur(totalDue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {totalDue > 0.005 ? (
              <p>
                {overdueCount > 0 ? (
                  <>
                    Dont <span className="font-medium text-destructive">{eur(overdueDue)}</span> en
                    retard ({overdueCount} échéance{overdueCount > 1 ? 's' : ''}).
                  </>
                ) : (
                  'À régler prochainement.'
                )}
              </p>
            ) : (
              <p className="text-green-600">Vous êtes à jour. Merci !</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Déclarer un paiement */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Déclarer un paiement</CardTitle>
          <CardDescription>
            Renseignez votre virement : la régie le validera et émettra votre quittance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeclarePaymentForm
            leaseId={lease.id}
            defaultAmount={totalDue > 0.005 ? Math.round(totalDue * 100) / 100 : monthly}
          />
        </CardContent>
      </Card>

      {/* Historique des paiements */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Historique des paiements</h2>
        {payments.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            Aucun paiement pour le moment.
          </div>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-4">
                  <div className="space-y-0.5">
                    <p className="font-medium">{eur(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.payment_date}
                      {p.method ? ` · ${p.method}` : ''}
                      {p.reference ? ` · réf. ${p.reference}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
