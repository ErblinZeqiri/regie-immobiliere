'use server'

import { z } from 'zod'
import { zuuid } from '@/lib/zutil'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { monthLabelFr, round2, toActionError } from '@/lib/server-helpers'
import type { ActionResult, DocumentRow } from '@/lib/types'

const RECEIPTS_BUCKET = 'documents' // bucket Storage PRIVÉ (à créer côté Supabase)

const GenerateRentReceiptInput = z.object({
  paymentId: zuuid(),
})

export type GenerateRentReceiptInput = z.input<typeof GenerateRentReceiptInput>

/** Formate un montant en euros (Kosovo = EUR). */
function formatEUR(value: number | string): string {
  return `${round2(value).toFixed(2)} €`
}

interface ReceiptResult {
  document: DocumentRow
  /** URL signée (1 h) pour téléchargement immédiat. */
  signedUrl: string | null
  storagePath: string
}

/**
 * generateRentReceipt — génère la quittance PDF d'un paiement VALIDÉ et
 * l'enregistre dans documents + Storage.
 *
 * SÉCURITÉ : ADMIN uniquement (émettre une quittance engage la régie). On passe
 * par service_role APRÈS requireAdmin(), à la fois pour lire les données liées
 * et pour écrire dans un bucket PRIVÉ. Le fichier n'est jamais public : l'accès
 * se fait via URL signée à durée courte.
 *
 * IDEMPOTENCE : le chemin est déterministe (receipts/{leaseId}/{paymentId}.pdf).
 * On upsert le fichier et on réutilise la ligne documents existante s'il y en a
 * une → régénérer ne crée pas de doublon.
 *
 * NOTE : à appeler après validatePayment (ou dans la même foulée côté UI).
 */
export async function generateRentReceipt(
  input: GenerateRentReceiptInput,
): Promise<ActionResult<ReceiptResult>> {
  try {
    const { paymentId } = GenerateRentReceiptInput.parse(input)
    const me = await requireAdmin()
    const admin = createAdminClient()

    // 1. Paiement (doit être validé)
    const { data: payment, error: payErr } = await admin
      .from('payments')
      .select('id, lease_id, amount, payment_date, method, reference, status')
      .eq('id', paymentId)
      .maybeSingle()
    if (payErr) throw payErr
    if (!payment) return { ok: false, error: 'Paiement introuvable.', code: 'not_found' }
    if (payment.status !== 'validated') {
      return { ok: false, error: 'La quittance ne peut être émise que pour un paiement validé.', code: 'invalid_state' }
    }

    // 2. Bail + bien + locataire
    const { data: lease, error: leaseErr } = await admin
      .from('leases')
      .select('id, property_id, tenant_id, rent_amount, charges_amount')
      .eq('id', payment.lease_id)
      .single()
    if (leaseErr) throw leaseErr

    const [{ data: property, error: propErr }, { data: tenant, error: tenantErr }] =
      await Promise.all([
        admin.from('properties').select('reference, title, address, city').eq('id', lease.property_id).single(),
        admin.from('profiles').select('full_name, email').eq('id', lease.tenant_id).single(),
      ])
    if (propErr) throw propErr
    if (tenantErr) throw tenantErr

    // 3. Échéances couvertes par ce paiement (via les allocations)
    const { data: allocations, error: allocErr } = await admin
      .from('payment_allocations')
      .select('amount, rent_charges(label, period)')
      .eq('payment_id', paymentId)
    if (allocErr) throw allocErr

    const covered = (allocations ?? []) as Array<{
      amount: string
      rent_charges: { label: string | null; period: string | null } | null
    }>
    const periodLabel =
      covered.find((c) => c.rent_charges?.period)?.rent_charges?.period?.slice(0, 7)
    const periodText = periodLabel ? monthLabelFr(periodLabel) : '—'

    // 4. Génération du PDF (pdf-lib)
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([595.28, 841.89]) // A4 en points
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const ink = rgb(0.1, 0.1, 0.12)
    const muted = rgb(0.4, 0.4, 0.45)

    let y = 790
    const left = 56
    const line = (text: string, size = 11, f = font, color = ink) => {
      page.drawText(text, { x: left, y, size, font: f, color })
      y -= size + 8
    }

    line('QUITTANCE DE LOYER', 20, bold)
    y -= 6
    line('Régie immobilière — Ferizaj, Kosovo', 10, font, muted)
    y -= 18

    line(`Quittance n° ${payment.id.slice(0, 8).toUpperCase()}`, 11, bold)
    line(`Période : ${periodText}`)
    line(`Émise le : ${new Date().toISOString().slice(0, 10)}`)
    y -= 12

    line('Locataire', 12, bold)
    line(tenant.full_name ?? '—')
    if (tenant.email) line(tenant.email, 10, font, muted)
    y -= 12

    line('Bien loué', 12, bold)
    line(`${property.reference ?? ''} — ${property.title}`.trim())
    line(`${property.address ?? ''}, ${property.city ?? ''}`.trim(), 10, font, muted)
    y -= 12

    line('Détail du paiement', 12, bold)
    line(`Montant reçu : ${formatEUR(payment.amount)}`)
    line(`Date du paiement : ${payment.payment_date}`)
    line(`Moyen : ${payment.method ?? '—'}${payment.reference ? ` (réf. ${payment.reference})` : ''}`)
    y -= 6
    for (const c of covered) {
      line(`  • ${c.rent_charges?.label ?? 'Échéance'} : ${formatEUR(c.amount)}`, 10, font, muted)
    }
    y -= 16

    line(
      `Reçu de ${tenant.full_name ?? 'le locataire'} la somme de ${formatEUR(payment.amount)} au titre du loyer.`,
      11,
    )
    y -= 30
    line('Signature de la régie', 10, font, muted)

    const pdfBytes = await pdf.save()

    // 5. Upload dans le bucket PRIVÉ (chemin déterministe).
    //    Convention documents : lease/{leaseId}/... — voir policies Storage.
    const storagePath = `lease/${lease.id}/receipts/${payment.id}.pdf`
    const { error: upErr } = await admin.storage
      .from(RECEIPTS_BUCKET)
      .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true })
    if (upErr) throw upErr

    // 6. Ligne documents — réutilise l'existante si régénération
    const { data: existing, error: existErr } = await admin
      .from('documents')
      .select('*')
      .eq('file_url', storagePath)
      .maybeSingle()
    if (existErr) throw existErr

    let document: DocumentRow
    if (existing) {
      document = existing as DocumentRow
    } else {
      const { data: inserted, error: insErr } = await admin
        .from('documents')
        .insert({
          property_id: lease.property_id,
          lease_id: lease.id,
          uploaded_by: me.id,
          type: 'receipt',
          name: `Quittance ${periodText} — ${property.reference ?? property.title}`,
          file_url: storagePath,
        })
        .select()
        .single()
      if (insErr) throw insErr
      document = inserted as DocumentRow
    }

    // 7. URL signée pour téléchargement immédiat
    const { data: signed } = await admin.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrl(storagePath, 60 * 60)

    revalidatePath('/admin/documents') // adapte le chemin
    return {
      ok: true,
      data: { document, signedUrl: signed?.signedUrl ?? null, storagePath },
    }
  } catch (e) {
    return toActionError(e)
  }
}
