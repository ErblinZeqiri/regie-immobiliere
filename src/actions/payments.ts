'use server'

import { z } from 'zod'
import { zuuid } from '@/lib/zutil'
import { revalidatePath } from 'next/cache'
import { requireAdmin, requireUser } from '@/lib/auth/guards'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { round2, toActionError } from '@/lib/server-helpers'
import type { ActionResult, Payment } from '@/lib/types'

// ===========================================================================
// declarePayment — LOCATAIRE déclare un paiement (toujours en 'pending')
// ===========================================================================
const DeclarePaymentInput = z.object({
  leaseId: zuuid(),
  amount: z.number().positive('Le montant doit être positif'),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : YYYY-MM-DD'),
  method: z.enum(['bank_transfer', 'cash', 'card', 'other']).optional(),
  reference: z.string().max(100).optional(),
  /** Chemin du justificatif dans Storage (bucket privé), pas une URL publique. */
  proofUrl: z.string().max(500).optional(),
})

export type DeclarePaymentInput = z.input<typeof DeclarePaymentInput>

/**
 * SÉCURITÉ : action côté LOCATAIRE. On utilise le client UTILISATEUR (pas
 * service_role) : la RLS `payments_tenant_declare` impose déjà
 *   status = 'pending'  ET  le bail appartient à auth.uid().
 * Un owner/admin qui appellerait cette action serait refusé par la RLS — c'est
 * voulu : la déclaration est réservée au locataire du bail.
 */
export async function declarePayment(
  input: DeclarePaymentInput,
): Promise<ActionResult<Payment>> {
  try {
    const data = DeclarePaymentInput.parse(input)
    await requireUser() // doit être connecté ; la RLS fait le contrôle fin

    const supabase = await createUserClient()

    // Pré-contrôle lisible : le bail doit être visible par l'utilisateur
    // (donc il en est le locataire, via RLS). Évite un message d'erreur SQL brut.
    const { data: lease, error: leaseErr } = await supabase
      .from('leases')
      .select('id, tenant_id')
      .eq('id', data.leaseId)
      .maybeSingle()
    if (leaseErr) throw leaseErr
    if (!lease) {
      return { ok: false, error: 'Bail introuvable ou accès refusé.', code: 'forbidden' }
    }

    const { data: payment, error } = await supabase
      .from('payments')
      .insert({
        lease_id: data.leaseId,
        amount: round2(data.amount),
        payment_date: data.paymentDate,
        method: data.method ?? 'bank_transfer',
        reference: data.reference ?? null,
        proof_url: data.proofUrl ?? null,
        status: 'pending', // forcé : jamais validé côté locataire
      })
      .select()
      .single()
    if (error) throw error

    revalidatePath('/locataire/paiements') // adapte le chemin
    return { ok: true, data: payment as Payment }
  } catch (e) {
    return toActionError(e)
  }
}

// ===========================================================================
// validatePayment — ADMIN valide un paiement + crée les allocations
// ===========================================================================
const AllocationInput = z.object({
  rentChargeId: zuuid(),
  amount: z.number().positive(),
})

const ValidatePaymentInput = z.object({
  paymentId: zuuid(),
  /**
   * Allocations explicites paiement -> échéances. Si absent, la fonction SQL
   * auto-alloue en FIFO sur les échéances les plus anciennes non soldées
   * (gère nativement le paiement partiel).
   */
  allocations: z.array(AllocationInput).min(1).optional(),
})

export type ValidatePaymentInput = z.input<typeof ValidatePaymentInput>

/**
 * SÉCURITÉ : ADMIN uniquement. Écrit dans payment_allocations + passe le
 * paiement en 'validated' → opération sensible (argent).
 *
 * ATOMICITÉ : toute la logique (vérifications + insertions + update) vit dans
 * la fonction Postgres `validate_payment` (transactionnelle). L'action ne fait
 * qu'AUTORISER puis appeler l'RPC via service_role. Cela évite un état
 * incohérent (allocations créées mais paiement resté 'pending').
 * Voir migration : 20260811000100_validate_payment_fn.sql
 */
export async function validatePayment(
  input: ValidatePaymentInput,
): Promise<ActionResult<Payment>> {
  try {
    const { paymentId, allocations } = ValidatePaymentInput.parse(input)
    const admin = await requireAdmin()

    // Contrôle métier : la somme allouée ne peut dépasser le montant du paiement.
    // (La fonction SQL + le trigger check_allocation le revérifient côté base.)
    const client = createAdminClient()

    const pAllocations = allocations
      ? allocations.map((a) => ({
          rent_charge_id: a.rentChargeId,
          amount: round2(a.amount),
        }))
      : null

    const { data, error } = await client.rpc('validate_payment', {
      p_payment_id: paymentId,
      p_validated_by: admin.id,
      p_allocations: pAllocations,
    })
    if (error) throw error

    // La fonction renvoie la ligne payments mise à jour (objet ou tableau selon
    // la version PostgREST) — on normalise.
    const payment = (Array.isArray(data) ? data[0] : data) as Payment

    revalidatePath('/admin/loyers') // adapte le chemin
    return { ok: true, data: payment }
  } catch (e) {
    return toActionError(e)
  }
}
