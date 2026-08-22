'use server'

import { z } from 'zod'
import { zuuid } from '@/lib/zutil'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { round2, toActionError } from '@/lib/server-helpers'
import { normalizeForMatch } from '@/lib/payment-ref'
import { notifyPaymentValidated, notifyReconciliationExceptions } from '@/lib/email/notify'
import type { ActionResult } from '@/lib/types'

// ---------------------------------------------------------------------------
// importBankStatement — importe un relevé CSV et rapproche automatiquement.
// ---------------------------------------------------------------------------
const TxInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue : YYYY-MM-DD'),
  amount: z.number(),
  label: z.string().max(500),
})

const ImportInput = z.object({
  filename: z.string().max(200).optional(),
  rows: z.array(TxInput).min(1).max(2000),
})

export type ImportBankStatementInput = z.input<typeof ImportInput>

interface ImportSummary {
  importId: string
  total: number
  validated: number
  exceptions: number
}

const EPS = 0.01

/**
 * Règles de matching (Phase 1) :
 *  - référence trouvée dans le libellé + montant == solde de l'échéance → validation auto
 *  - référence trouvée + montant différent → exception
 *  - aucune référence reconnue → exception
 *
 * SÉCURITÉ : ADMIN uniquement, service_role après requireAdmin(). La création +
 * validation du paiement réutilise le RPC transactionnel `validate_payment`.
 */
export async function importBankStatement(
  input: ImportBankStatementInput,
): Promise<ActionResult<ImportSummary>> {
  try {
    const { filename, rows } = ImportInput.parse(input)
    const me = await requireAdmin()
    const admin = createAdminClient()

    // 1. Échéances actives avec référence -> solde restant.
    const { data: chargesRaw, error: chErr } = await admin
      .from('rent_charges')
      .select('id, amount, payment_ref, lease_id')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('payment_ref', 'is', null)
    if (chErr) throw chErr
    const charges = (chargesRaw ?? []) as {
      id: string
      amount: string
      payment_ref: string
      lease_id: string
    }[]

    const allocByCharge = new Map<string, number>()
    if (charges.length > 0) {
      const { data: allocs } = await admin
        .from('payment_allocations')
        .select('rent_charge_id, amount')
        .in('rent_charge_id', charges.map((c) => c.id))
      for (const a of allocs ?? [])
        allocByCharge.set(a.rent_charge_id, (allocByCharge.get(a.rent_charge_id) ?? 0) + Number(a.amount))
    }

    // Index : référence normalisée -> état de l'échéance (solde mutable).
    const refIndex = charges.map((c) => ({
      norm: normalizeForMatch(c.payment_ref),
      ref: c.payment_ref,
      chargeId: c.id,
      leaseId: c.lease_id,
      remaining: round2(Number(c.amount) - (allocByCharge.get(c.id) ?? 0)),
    }))

    // 2. Crée l'import.
    const { data: imp, error: impErr } = await admin
      .from('bank_imports')
      .insert({ filename: filename ?? null, imported_by: me.id, row_count: rows.length })
      .select('id')
      .single()
    if (impErr) throw impErr
    const importId = imp.id as string

    let validated = 0
    let exceptions = 0
    const validatedPaymentIds: string[] = []

    // 3. Rapproche chaque ligne.
    for (const row of rows) {
      const amount = round2(row.amount)
      const normLabel = normalizeForMatch(row.label)
      const hit = normLabel && amount > 0
        ? refIndex.find((r) => r.norm.length > 0 && normLabel.includes(r.norm))
        : undefined

      let status: 'validated' | 'exception' = 'exception'
      let matchedChargeId: string | null = null
      let paymentId: string | null = null
      let note: string | null = null

      if (!hit) {
        note = amount <= 0 ? 'Ligne ignorée (montant nul ou négatif).' : 'Aucune référence reconnue dans le libellé.'
      } else {
        matchedChargeId = hit.chargeId
        if (hit.remaining <= EPS) {
          note = `Échéance déjà soldée (réf. ${hit.ref}).`
        } else if (Math.abs(amount - hit.remaining) > EPS) {
          note = `Montant différent — attendu ${hit.remaining.toFixed(2)} €, reçu ${amount.toFixed(2)} €.`
        } else {
          // Match parfait -> création + validation auto du paiement.
          try {
            const { data: pay, error: payErr } = await admin
              .from('payments')
              .insert({
                lease_id: hit.leaseId,
                amount,
                payment_date: row.date,
                method: 'bank_transfer',
                reference: hit.ref,
                status: 'pending',
              })
              .select('id')
              .single()
            if (payErr) throw payErr

            const { error: rpcErr } = await admin.rpc('validate_payment', {
              p_payment_id: pay.id,
              p_validated_by: me.id,
              p_allocations: [{ rent_charge_id: hit.chargeId, amount }],
            })
            if (rpcErr) {
              // Rollback léger : on retire le paiement pending resté orphelin.
              await admin.from('payments').delete().eq('id', pay.id)
              throw rpcErr
            }

            status = 'validated'
            paymentId = pay.id
            hit.remaining = round2(hit.remaining - amount) // évite un double-match
            note = `Rapproché automatiquement (réf. ${hit.ref}).`
          } catch {
            note = `Référence reconnue mais échec de la validation automatique (réf. ${hit.ref}).`
          }
        }
      }

      await admin.from('bank_transactions').insert({
        import_id: importId,
        tx_date: row.date,
        amount,
        label: row.label,
        status,
        matched_charge_id: matchedChargeId,
        payment_id: paymentId,
        note,
      })

      if (status === 'validated') {
        validated += 1
        if (paymentId) validatedPaymentIds.push(paymentId)
      } else exceptions += 1
    }

    await admin
      .from('bank_imports')
      .update({ validated_count: validated, exception_count: exceptions })
      .eq('id', importId)

    // Notifications — sans jamais bloquer l'import.
    for (const id of validatedPaymentIds) await notifyPaymentValidated(id)
    await notifyReconciliationExceptions(importId, exceptions)

    revalidatePath('/admin/rapprochement')
    revalidatePath('/admin/loyers')
    return { ok: true, data: { importId, total: rows.length, validated, exceptions } }
  } catch (e) {
    return toActionError(e)
  }
}

// ---------------------------------------------------------------------------
// resolveBankTransaction — traitement manuel d'une exception.
// ---------------------------------------------------------------------------
const ResolveInput = z.object({
  txId: zuuid(),
  action: z.enum(['validate', 'ignore']),
  /** Échéance cible (requise pour 'validate'). */
  chargeId: zuuid().optional(),
})

export type ResolveBankTransactionInput = z.input<typeof ResolveInput>

export async function resolveBankTransaction(
  input: ResolveBankTransactionInput,
): Promise<ActionResult<{ status: string }>> {
  try {
    const { txId, action, chargeId } = ResolveInput.parse(input)
    const me = await requireAdmin()
    const admin = createAdminClient()

    const { data: tx, error: txErr } = await admin
      .from('bank_transactions')
      .select('id, amount, tx_date, status')
      .eq('id', txId)
      .maybeSingle()
    if (txErr) throw txErr
    if (!tx) return { ok: false, error: 'Transaction introuvable.', code: 'not_found' }

    if (action === 'ignore') {
      await admin.from('bank_transactions').update({ status: 'ignored', note: 'Ignorée manuellement.' }).eq('id', txId)
      revalidatePath('/admin/rapprochement')
      return { ok: true, data: { status: 'ignored' } }
    }

    // action === 'validate' : rapprocher sur l'échéance choisie.
    if (!chargeId) return { ok: false, error: 'Échéance cible requise.', code: 'bad_request' }

    const { data: charge, error: cErr } = await admin
      .from('rent_charges')
      .select('id, lease_id, payment_ref')
      .eq('id', chargeId)
      .maybeSingle()
    if (cErr) throw cErr
    if (!charge) return { ok: false, error: 'Échéance introuvable.', code: 'not_found' }

    const { data: pay, error: payErr } = await admin
      .from('payments')
      .insert({
        lease_id: charge.lease_id,
        amount: round2(Number(tx.amount)),
        payment_date: tx.tx_date,
        method: 'bank_transfer',
        reference: charge.payment_ref ?? null,
        status: 'pending',
      })
      .select('id')
      .single()
    if (payErr) throw payErr

    const { error: rpcErr } = await admin.rpc('validate_payment', {
      p_payment_id: pay.id,
      p_validated_by: me.id,
      p_allocations: [{ rent_charge_id: chargeId, amount: round2(Number(tx.amount)) }],
    })
    if (rpcErr) {
      await admin.from('payments').delete().eq('id', pay.id)
      throw rpcErr
    }

    await admin
      .from('bank_transactions')
      .update({ status: 'resolved', matched_charge_id: chargeId, payment_id: pay.id, note: 'Rapprochée manuellement.' })
      .eq('id', txId)

    await notifyPaymentValidated(pay.id)

    revalidatePath('/admin/rapprochement')
    revalidatePath('/admin/loyers')
    return { ok: true, data: { status: 'resolved' } }
  } catch (e) {
    return toActionError(e)
  }
}
