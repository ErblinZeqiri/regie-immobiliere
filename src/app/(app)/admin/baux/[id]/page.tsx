import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GenerateChargesButton } from '@/components/generate-charges-button'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

interface LeaseDetail {
  id: string
  start_date: string
  end_date: string | null
  rent_amount: string
  charges_amount: string
  deposit_amount: string
  status: string
  property: { id: string; reference: string | null; title: string } | null
  tenant: { full_name: string | null; email: string | null } | null
}

function ChargeStatus({ remaining, amount, cancelled }: { remaining: number; amount: number; cancelled: boolean }) {
  if (cancelled) return <Badge variant="secondary">Annulée</Badge>
  if (remaining <= 0.005) return <Badge className="border-transparent bg-green-600 text-white">Soldée</Badge>
  if (remaining < amount - 0.005)
    return <Badge variant="outline" className="border-amber-500 text-amber-600">Partielle</Badge>
  return <Badge variant="destructive">Due</Badge>
}

function PaymentStatus({ status }: { status: string }) {
  if (status === 'validated') return <Badge className="border-transparent bg-green-600 text-white">Validé</Badge>
  if (status === 'pending') return <Badge className="border-transparent bg-amber-500 text-white">En attente</Badge>
  return <Badge variant="destructive">Rejeté</Badge>
}

export default async function BailDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()

  const supabase = await createUserClient()

  const { data: leaseRaw } = await supabase
    .from('leases')
    .select(
      'id, start_date, end_date, rent_amount, charges_amount, deposit_amount, status, property:properties(id, reference, title), tenant:profiles(full_name, email)',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  const lease = leaseRaw as unknown as LeaseDetail | null
  if (!lease) notFound()

  // Échéances + allocations -> reste dû
  const { data: charges } = await supabase
    .from('rent_charges')
    .select('id, label, due_date, amount, status')
    .eq('lease_id', id)
    .is('deleted_at', null)
    .order('due_date', { ascending: false })

  const chargeIds = (charges ?? []).map((c) => c.id)
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

  const { data: payments } = await supabase
    .from('payments')
    .select('id, amount, payment_date, method, reference, status')
    .eq('lease_id', id)
    .is('deleted_at', null)
    .order('payment_date', { ascending: false })

  const monthly = Number(lease.rent_amount) + Number(lease.charges_amount)

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/admin/baux"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux baux
      </Link>

      {/* Infos du bail */}
      <Card>
        <CardHeader className="pb-3">
          <CardDescription>Bail</CardDescription>
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            {lease.property?.reference ?? lease.property?.title ?? 'Bien'}
            <span className="text-muted-foreground">·</span>
            {lease.tenant?.full_name ?? '—'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-1 text-sm sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Loyer</dt><dd className="amount">{eur(lease.rent_amount)}</dd></div>
            <div><dt className="text-muted-foreground">Charges</dt><dd className="amount">{eur(lease.charges_amount)}</dd></div>
            <div><dt className="text-muted-foreground">Total /mois</dt><dd className="amount">{eur(monthly)}</dd></div>
            <div><dt className="text-muted-foreground">Dépôt</dt><dd className="amount">{eur(lease.deposit_amount)}</dd></div>
            <div><dt className="text-muted-foreground">Début</dt><dd>{lease.start_date}</dd></div>
            <div><dt className="text-muted-foreground">Fin</dt><dd>{lease.end_date ?? '—'}</dd></div>
            <div>
              <dt className="text-muted-foreground">Statut</dt>
              <dd>
                {lease.status === 'active' ? (
                  <Badge className="border-transparent bg-green-600 text-white">Actif</Badge>
                ) : (
                  <Badge variant="secondary">{lease.status === 'ended' ? 'Terminé' : 'Résilié'}</Badge>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Échéances */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Échéances</h2>
          <GenerateChargesButton leaseId={lease.id} label="Générer ce mois" />
        </div>

        {(charges ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            Aucune échéance. Générez-en une ci-dessus.
          </div>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Libellé</th>
                    <th className="p-3 font-medium">Échéance</th>
                    <th className="p-3 font-medium">Montant</th>
                    <th className="p-3 font-medium">Reste dû</th>
                    <th className="p-3 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(charges ?? []).map((c) => {
                    const amount = Number(c.amount)
                    const remaining = amount - (allocByCharge.get(c.id) ?? 0)
                    const cancelled = c.status === 'cancelled'
                    return (
                      <tr key={c.id} className="hover:bg-muted/40">
                        <td className="p-3">{c.label ?? 'Échéance'}</td>
                        <td className="p-3 text-muted-foreground">{c.due_date}</td>
                        <td className="p-3 amount">{eur(amount)}</td>
                        <td className="p-3 amount">{eur(cancelled ? 0 : Math.max(0, remaining))}</td>
                        <td className="p-3">
                          <ChargeStatus remaining={remaining} amount={amount} cancelled={cancelled} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Paiements */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Paiements</h2>
        {(payments ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            Aucun paiement.
          </div>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {(payments ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between p-4">
                  <div className="space-y-0.5">
                    <p className="amount text-base">{eur(p.amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.payment_date}
                      {p.method ? ` · ${p.method}` : ''}
                      {p.reference ? ` · réf. ${p.reference}` : ''}
                    </p>
                  </div>
                  <PaymentStatus status={p.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
