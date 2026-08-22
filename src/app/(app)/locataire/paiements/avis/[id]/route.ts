import { createUserClient } from '@/lib/supabase/server'
import { monthLabelFr } from '@/lib/server-helpers'
import { getAgencySettings } from '@/lib/agency'
import { buildAvisPdf } from '@/lib/pdf/tenant-docs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ChargeRow {
  id: string
  label: string | null
  due_date: string
  amount: string
  period: string
  payment_ref: string | null
  lease: {
    tenant: { full_name: string | null } | null
    property: { reference: string | null; title: string; address: string | null; city: string | null } | null
  } | null
}

/**
 * GET /locataire/paiements/avis/[id] — avis de paiement PDF d'une échéance.
 * SÉCURITÉ : client utilisateur → la RLS ne renvoie l'échéance que si elle
 * appartient au bail du locataire connecté.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return new Response('Introuvable', { status: 404 })

  const supabase = await createUserClient()
  const { data } = await supabase
    .from('rent_charges')
    .select(
      'id, label, due_date, amount, period, payment_ref, lease:leases(tenant:profiles(full_name), property:properties(reference, title, address, city))',
    )
    .eq('id', id)
    .maybeSingle()
  const charge = data as unknown as ChargeRow | null
  if (!charge) return new Response('Introuvable', { status: 404 })

  const bytes = await buildAvisPdf({
    tenantName: charge.lease?.tenant?.full_name ?? '—',
    property: charge.lease?.property ?? null,
    periodLabel: monthLabelFr(charge.period.slice(0, 7)),
    chargeLabel: charge.label ?? 'Loyer',
    dueDate: charge.due_date,
    amount: Number(charge.amount),
    paymentRef: charge.payment_ref ?? '—',
    generatedDate: new Date().toISOString().slice(0, 10),
    agency: await getAgencySettings(),
  })

  const filename = `avis-${charge.payment_ref ?? charge.id.slice(0, 8)}.pdf`
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
