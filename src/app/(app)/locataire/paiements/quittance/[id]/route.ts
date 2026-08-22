import { createUserClient } from '@/lib/supabase/server'
import { monthLabelFr } from '@/lib/server-helpers'
import { getAgencySettings } from '@/lib/agency'
import { buildQuittancePdf } from '@/lib/pdf/tenant-docs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PaymentRow {
  id: string
  amount: string
  payment_date: string
  method: string | null
  reference: string | null
  status: string
  lease: {
    tenant: { full_name: string | null } | null
    property: { reference: string | null; title: string; address: string | null; city: string | null } | null
  } | null
  allocations: { amount: string; rent_charge: { label: string | null; period: string | null } | null }[]
}

/**
 * GET /locataire/paiements/quittance/[id] — quittance PDF d'un paiement VALIDÉ.
 * SÉCURITÉ : client utilisateur → RLS ; le locataire ne voit que ses paiements.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return new Response('Introuvable', { status: 404 })

  const supabase = await createUserClient()
  const { data } = await supabase
    .from('payments')
    .select(
      'id, amount, payment_date, method, reference, status, lease:leases(tenant:profiles(full_name), property:properties(reference, title, address, city)), allocations:payment_allocations(amount, rent_charge:rent_charges(label, period))',
    )
    .eq('id', id)
    .maybeSingle()
  const payment = data as unknown as PaymentRow | null
  if (!payment) return new Response('Introuvable', { status: 404 })
  if (payment.status !== 'validated')
    return new Response('Quittance disponible après validation du paiement.', { status: 409 })

  const covered = (payment.allocations ?? []).map((a) => ({
    label: a.rent_charge?.label ?? 'Échéance',
    amount: Number(a.amount),
  }))
  const periods = Array.from(
    new Set((payment.allocations ?? []).map((a) => a.rent_charge?.period?.slice(0, 7)).filter(Boolean)),
  ) as string[]
  const periodLabel =
    periods.length === 1 ? monthLabelFr(periods[0]) : periods.length > 1 ? 'Plusieurs échéances' : '—'

  const bytes = await buildQuittancePdf({
    tenantName: payment.lease?.tenant?.full_name ?? '—',
    property: payment.lease?.property ?? null,
    amount: Number(payment.amount),
    paymentDate: payment.payment_date,
    method: payment.method,
    reference: payment.reference,
    quittanceNo: payment.id.slice(0, 8).toUpperCase(),
    periodLabel,
    covered,
    generatedDate: new Date().toISOString().slice(0, 10),
    agency: await getAgencySettings(),
  })

  const filename = `quittance-${payment.id.slice(0, 8)}.pdf`
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
