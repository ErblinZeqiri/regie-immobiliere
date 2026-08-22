import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { monthLabelFr } from '@/lib/server-helpers'
import { sendEmail, appUrl } from '@/lib/email/resend'
import { renderEmail } from '@/lib/email/templates'

type Admin = ReturnType<typeof createAdminClient>

const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

async function agencyName(admin: Admin): Promise<string> {
  const { data } = await admin.from('agency_settings').select('legal_name').eq('id', 1).maybeSingle()
  return data?.legal_name ?? 'Pron Gérance'
}

async function adminEmails(admin: Admin): Promise<string[]> {
  const { data } = await admin.from('profiles').select('email').eq('role', 'admin')
  return (data ?? []).map((p) => p.email).filter((e): e is string => !!e)
}

/** Emails de tous les propriétaires d'un bien (owner_id + indivision). */
async function ownerEmails(admin: Admin, propertyId: string): Promise<string[]> {
  const ids = new Set<string>()
  const { data: prop } = await admin.from('properties').select('owner_id').eq('id', propertyId).maybeSingle()
  if (prop?.owner_id) ids.add(prop.owner_id)
  const { data: co } = await admin.from('property_owners').select('owner_id').eq('property_id', propertyId)
  for (const r of co ?? []) if (r.owner_id) ids.add(r.owner_id)
  if (ids.size === 0) return []
  const { data: profs } = await admin.from('profiles').select('email').in('id', [...ids])
  return (profs ?? []).map((p) => p.email).filter((e): e is string => !!e)
}

function propertyLabel(p: { reference: string | null; title: string } | null): string {
  if (!p) return 'Votre bien'
  return `${p.reference ? p.reference + ' — ' : ''}${p.title}`
}

/* ============================ 1 + 5. Paiement validé ====================== */
export async function notifyPaymentValidated(paymentId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: pay } = await admin
      .from('payments')
      .select('id, amount, payment_date, status, lease_id')
      .eq('id', paymentId)
      .maybeSingle()
    if (!pay || pay.status !== 'validated') return

    const { data: leaseRaw } = await admin
      .from('leases')
      .select('property_id, property:properties(reference, title), tenant:profiles(full_name, email)')
      .eq('id', pay.lease_id)
      .maybeSingle()
    const lease = leaseRaw as unknown as {
      property_id: string
      property: { reference: string | null; title: string } | null
      tenant: { full_name: string | null; email: string | null } | null
    } | null
    if (!lease) return

    const { data: allocs } = await admin
      .from('payment_allocations')
      .select('rent_charge:rent_charges(period)')
      .eq('payment_id', paymentId)
    const periods = Array.from(
      new Set(
        ((allocs ?? []) as unknown as { rent_charge: { period: string | null } | null }[])
          .map((a) => a.rent_charge?.period?.slice(0, 7))
          .filter(Boolean) as string[],
      ),
    )
    const periodLabel =
      periods.length === 1 ? monthLabelFr(periods[0]) : periods.length > 1 ? 'plusieurs échéances' : monthLabelFr(pay.payment_date.slice(0, 7))

    const agency = await agencyName(admin)
    const propLabel = propertyLabel(lease.property)

    // 1. Locataire
    await sendEmail({
      to: lease.tenant?.email,
      fromName: agency,
      subject: `Paiement validé — ${periodLabel}`,
      html: renderEmail({
        agencyName: agency,
        preheader: `Votre paiement de ${eur(pay.amount)} a été validé.`,
        heading: 'Votre paiement a été validé',
        intro: `Bonjour ${lease.tenant?.full_name ?? ''}, nous confirmons la réception et la validation de votre paiement. Votre quittance est disponible dans votre espace.`,
        rows: [
          { label: 'Montant', value: eur(pay.amount) },
          { label: 'Période', value: periodLabel },
          { label: 'Date', value: pay.payment_date },
        ],
        cta: { label: 'Voir ma quittance', href: appUrl('/locataire/paiements') },
      }),
    })

    // 5. Propriétaire(s)
    await sendEmail({
      to: await ownerEmails(admin, lease.property_id),
      fromName: agency,
      subject: `Loyer encaissé — ${propLabel}`,
      html: renderEmail({
        agencyName: agency,
        preheader: `Un loyer de ${eur(pay.amount)} a été encaissé.`,
        heading: 'Un loyer a été encaissé',
        intro: `Un paiement a été validé pour votre bien ${propLabel}.`,
        rows: [
          { label: 'Bien', value: propLabel },
          { label: 'Montant', value: eur(pay.amount) },
          { label: 'Période', value: periodLabel },
        ],
        cta: { label: 'Voir mes loyers', href: appUrl('/proprietaire/loyers') },
      }),
    })
  } catch (e) {
    console.error('[notify] notifyPaymentValidated', e)
  }
}

/* ============================== 2. Nouveau signalement ==================== */
const PRIORITY_LABELS: Record<string, string> = { low: 'basse', medium: 'moyenne', high: 'haute', urgent: 'urgente' }

export async function notifyNewIssue(issueId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: issueRaw } = await admin
      .from('issues')
      .select('id, title, description, priority, property_id, property:properties(reference, title)')
      .eq('id', issueId)
      .maybeSingle()
    const issue = issueRaw as unknown as {
      title: string
      description: string | null
      priority: string
      property_id: string
      property: { reference: string | null; title: string } | null
    } | null
    if (!issue) return

    const agency = await agencyName(admin)
    const propLabel = propertyLabel(issue.property)
    const recipients = [...(await adminEmails(admin)), ...(await ownerEmails(admin, issue.property_id))]

    await sendEmail({
      to: recipients,
      fromName: agency,
      subject: `Nouveau signalement — ${propLabel}`,
      html: renderEmail({
        agencyName: agency,
        preheader: `Signalement : ${issue.title}`,
        heading: 'Nouveau signalement',
        intro: `Un signalement a été créé sur le bien ${propLabel}.`,
        rows: [
          { label: 'Bien', value: propLabel },
          { label: 'Objet', value: issue.title },
          { label: 'Priorité', value: PRIORITY_LABELS[issue.priority] ?? issue.priority },
        ],
        quote: issue.description ? issue.description.slice(0, 240) : undefined,
        cta: { label: 'Ouvrir', href: appUrl('/admin/signalements') },
      }),
    })
  } catch (e) {
    console.error('[notify] notifyNewIssue', e)
  }
}

/* ============================== 3. Nouvelle candidature =================== */
export async function notifyNewApplication(input: {
  propertyId: string | null
  fullName: string
  email: string
  phone?: string | null
  message?: string | null
}): Promise<void> {
  try {
    const admin = createAdminClient()
    let propLabel = 'Candidature générale'
    if (input.propertyId) {
      const { data: p } = await admin.from('properties').select('reference, title').eq('id', input.propertyId).maybeSingle()
      propLabel = propertyLabel(p)
    }
    const agency = await agencyName(admin)

    await sendEmail({
      to: await adminEmails(admin),
      fromName: agency,
      subject: `Nouvelle candidature — ${propLabel}`,
      html: renderEmail({
        agencyName: agency,
        preheader: `${input.fullName} — ${propLabel}`,
        heading: 'Nouvelle candidature',
        intro: `Une nouvelle demande a été reçue depuis les annonces.`,
        rows: [
          { label: 'Bien', value: propLabel },
          { label: 'Nom', value: input.fullName },
          { label: 'Email', value: input.email },
          ...(input.phone ? [{ label: 'Téléphone', value: input.phone }] : []),
        ],
        quote: input.message ? input.message.slice(0, 300) : undefined,
        cta: { label: 'Voir les candidatures', href: appUrl('/admin/candidatures') },
      }),
    })
  } catch (e) {
    console.error('[notify] notifyNewApplication', e)
  }
}

/* ==================== 4. Exceptions de rapprochement ====================== */
export async function notifyReconciliationExceptions(importId: string, exceptionCount: number): Promise<void> {
  try {
    if (exceptionCount <= 0) return
    const admin = createAdminClient()
    const { data: imp } = await admin
      .from('bank_imports')
      .select('filename, row_count, validated_count, exception_count')
      .eq('id', importId)
      .maybeSingle()
    const agency = await agencyName(admin)

    await sendEmail({
      to: await adminEmails(admin),
      fromName: agency,
      subject: `Rapprochement bancaire — ${exceptionCount} exception${exceptionCount > 1 ? 's' : ''} à traiter`,
      html: renderEmail({
        agencyName: agency,
        preheader: `${exceptionCount} exception(s) après import.`,
        heading: 'Rapprochement : exceptions à traiter',
        intro: `Un import de relevé a généré des exceptions nécessitant un traitement manuel.`,
        rows: [
          ...(imp?.filename ? [{ label: 'Fichier', value: imp.filename }] : []),
          { label: 'Lignes', value: String(imp?.row_count ?? '—') },
          { label: 'Validées', value: String(imp?.validated_count ?? '—') },
          { label: 'Exceptions', value: String(exceptionCount) },
        ],
        cta: { label: 'Traiter les exceptions', href: appUrl('/admin/rapprochement') },
      }),
    })
  } catch (e) {
    console.error('[notify] notifyReconciliationExceptions', e)
  }
}
