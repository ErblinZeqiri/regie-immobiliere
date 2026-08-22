import { Wallet, Download, Info, FileText } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { CopyButton } from '@/components/copy-button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DeclarePaymentForm } from '@/components/declare-payment-form'

export const dynamic = 'force-dynamic'

const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

interface ChargeRow {
  id: string
  label: string | null
  due_date: string
  amount: string
  payment_ref: string | null
}
interface PaymentRow {
  id: string
  amount: string
  payment_date: string
  method: string | null
  reference: string | null
  status: string
}

async function getData() {
  const supabase = await createUserClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: leaseRaw } = await supabase
    .from('leases')
    .select('id, rent_amount, charges_amount')
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lease = leaseRaw as { id: string; rent_amount: string; charges_amount: string } | null
  if (!lease) return { lease: null }

  const today = new Date().toISOString().slice(0, 10)

  const { data: chargesRaw } = await supabase
    .from('rent_charges')
    .select('id, label, due_date, amount, payment_ref')
    .eq('lease_id', lease.id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('due_date', { ascending: true })
  const charges = (chargesRaw ?? []) as ChargeRow[]

  // Allocations -> montant réglé par échéance + paiement validé couvrant (quittance)
  const allocByCharge = new Map<string, number>()
  const chargeToPayment = new Map<string, string>()
  if (charges.length > 0) {
    const { data: allocsRaw } = await supabase
      .from('payment_allocations')
      .select('rent_charge_id, amount, payment:payments(id, status)')
      .in('rent_charge_id', charges.map((c) => c.id))
    const allocs = (allocsRaw ?? []) as unknown as {
      rent_charge_id: string
      amount: string
      payment: { id: string; status: string } | null
    }[]
    for (const a of allocs) {
      allocByCharge.set(a.rent_charge_id, (allocByCharge.get(a.rent_charge_id) ?? 0) + Number(a.amount))
      if (a.payment?.status === 'validated') chargeToPayment.set(a.rent_charge_id, a.payment.id)
    }
  }

  const echeances = charges.map((c) => {
    const paid = allocByCharge.get(c.id) ?? 0
    const remaining = Math.round((Number(c.amount) - paid) * 100) / 100
    const overdue = remaining > 0.005 && c.due_date < today
    return { ...c, paid, remaining, overdue }
  })
  const totalDue = echeances.reduce((s, e) => s + Math.max(0, e.remaining), 0)
  const overdueDue = echeances.filter((e) => e.overdue).reduce((s, e) => s + e.remaining, 0)
  const monthly = Number(lease.rent_amount) + Number(lease.charges_amount)

  // Historique des paiements
  const { data: paymentsRaw } = await supabase
    .from('payments')
    .select('id, amount, payment_date, method, reference, status')
    .eq('lease_id', lease.id)
    .is('deleted_at', null)
    .order('payment_date', { ascending: false })
  const payments = (paymentsRaw ?? []) as PaymentRow[]

  return { lease, echeances, totalDue, overdueDue, monthly, payments, chargeToPayment }
}

function EcheanceBadge({ remaining, overdue, paid }: { remaining: number; overdue: boolean; paid: number }) {
  if (remaining <= 0.005)
    return <Badge className="border-success/25 bg-success/10 text-success">Soldée</Badge>
  if (overdue) return <Badge variant="destructive">En retard</Badge>
  if (paid > 0.005)
    return <Badge className="border-amber-500/25 bg-amber-500/10 text-amber-600">Partielle</Badge>
  return <Badge variant="outline">À régler</Badge>
}

function PaymentBadge({ status }: { status: string }) {
  if (status === 'validated')
    return <Badge className="border-success/25 bg-success/10 text-success">Validé</Badge>
  if (status === 'pending')
    return <Badge className="border-amber-500/25 bg-amber-500/10 text-amber-600">En attente</Badge>
  return <Badge variant="destructive">Rejeté</Badge>
}

export default async function PaiementsPage() {
  const data = await getData()

  if (!data || !data.lease) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Paiements</h1>
        <div className="rounded-[10px] border border-dashed py-16 text-center text-sm text-muted-foreground">
          Aucun bail actif associé à votre compte. Contactez la régie.
        </div>
      </div>
    )
  }

  const { lease, echeances, totalDue, overdueDue, monthly, payments, chargeToPayment } = data

  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Paiements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vos échéances, la déclaration de vos règlements et vos quittances.
        </p>
      </header>

      {/* Solde + déclaration */}
      <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
        <Card className="kpi-card">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardDescription className="stat-label">Solde à régler</CardDescription>
            </div>
            <CardTitle
              className={cn('amount text-3xl', totalDue > 0.005 ? 'text-destructive' : 'text-success')}
            >
              {eur(totalDue)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {totalDue > 0.005 ? (
              overdueDue > 0.005 ? (
                <p>
                  Dont <span className="font-medium text-destructive">{eur(overdueDue)}</span> en retard.
                </p>
              ) : (
                <p>À régler prochainement.</p>
              )
            ) : (
              <p className="text-success">Vous êtes à jour. Merci !</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Déclarer un paiement</CardTitle>
            <CardDescription className="stat-label">
              La régie valide votre virement et émet la quittance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeclarePaymentForm
              leaseId={lease.id}
              defaultAmount={totalDue > 0.005 ? Math.round(totalDue * 100) / 100 : monthly}
            />
          </CardContent>
        </Card>
      </div>

      {/* Échéances */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Échéances</h2>

        <div className="mb-3 flex items-start gap-2.5 rounded-[10px] border border-border bg-accent/40 px-4 py-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p className="text-muted-foreground">
            Pour régler une échéance, virez le{' '}
            <span className="font-medium text-foreground">montant exact</span> en indiquant sa{' '}
            <span className="font-medium text-foreground">référence</span> dans le libellé —
            votre paiement sera rapproché automatiquement.
          </p>
        </div>

        {echeances.length === 0 ? (
          <div className="rounded-[10px] border border-dashed py-10 text-center text-sm text-muted-foreground">
            Aucune échéance pour le moment.
          </div>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {echeances.map((e) => {
                const open = e.remaining > 0.005
                return (
                  <div key={e.id} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{e.label ?? 'Échéance'}</p>
                        <p className="text-xs text-muted-foreground">
                          Échéance au {e.due_date}
                          {e.paid > 0.005 && open ? ` · ${eur(e.paid)} déjà réglé` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className={cn('amount text-sm', open ? 'text-foreground' : 'text-muted-foreground')}>
                          {open ? eur(e.remaining) : eur(e.amount)}
                        </span>
                        <EcheanceBadge remaining={e.remaining} overdue={e.overdue} paid={e.paid} />
                      </div>
                    </div>

                    {open && e.payment_ref && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-muted/60 px-3 py-2">
                        <span className="stat-label">Référence</span>
                        <code className="rounded bg-background px-2 py-0.5 font-mono text-sm font-semibold tracking-tight text-primary">
                          {e.payment_ref}
                        </code>
                        <CopyButton value={e.payment_ref} />
                        <a
                          href={`/locataire/paiements/avis/${e.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Avis de paiement
                        </a>
                      </div>
                    )}

                    {!open && chargeToPayment.get(e.id) && (
                      <div className="mt-3 flex items-center gap-x-4 rounded-md bg-muted/50 px-3 py-2">
                        <span className="stat-label text-success">Réglée</span>
                        <a
                          href={`/locataire/paiements/quittance/${chargeToPayment.get(e.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Quittance
                        </a>
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Historique */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Historique des paiements</h2>
        {payments.length === 0 ? (
          <div className="rounded-[10px] border border-dashed py-10 text-center text-sm text-muted-foreground">
            Aucun paiement pour le moment.
          </div>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-0.5">
                    <p className="amount text-base">{eur(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.payment_date}
                      {p.method ? ` · ${p.method}` : ''}
                      {p.reference ? ` · réf. ${p.reference}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {p.status === 'validated' && (
                      <Button
                        variant="outline"
                        size="sm"
                        render={
                          <a
                            href={`/locataire/paiements/quittance/${p.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          />
                        }
                      >
                        <Download className="h-4 w-4" />
                        Quittance
                      </Button>
                    )}
                    <PaymentBadge status={p.status} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
