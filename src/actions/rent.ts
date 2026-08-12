'use server'

import { z } from 'zod'
import { zuuid } from '@/lib/zutil'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { monthLabelFr, round2, toActionError } from '@/lib/server-helpers'
import type { ActionResult, RentCharge } from '@/lib/types'

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const GenerateRentChargesInput = z.object({
  /** Mois cible au format 'YYYY-MM'. */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format attendu : YYYY-MM'),
  /** Si absent : tous les baux actifs. Sinon : ce bail uniquement. */
  leaseId: zuuid().optional(),
  /** Jour d'échéance dans le mois (1–28). */
  dueDay: z.number().int().min(1).max(28).default(5),
  /** Générer aussi une ligne 'charges' quand charges_amount > 0. */
  includeCharges: z.boolean().default(false),
})

export type GenerateRentChargesInput = z.input<typeof GenerateRentChargesInput>

interface GenerateResult {
  created: number
  skipped: number
  charges: RentCharge[]
}

/**
 * generateRentCharges — génère les échéances d'un mois donné.
 *
 * SÉCURITÉ : ADMIN uniquement. Opération batch sur potentiellement tous les
 * baux → on utilise le client service_role APRÈS requireAdmin().
 *
 * IDEMPOTENCE : respecte l'unicité (lease_id, type, period). On pré-lit les
 * échéances déjà présentes pour ce mois et on n'insère que les manquantes ;
 * relancer l'action deux fois ne crée pas de doublon.
 */
export async function generateRentCharges(
  input: GenerateRentChargesInput,
): Promise<ActionResult<GenerateResult>> {
  try {
    const { month, leaseId, dueDay, includeCharges } =
      GenerateRentChargesInput.parse(input)

    await requireAdmin()
    const admin = createAdminClient()

    const period = `${month}-01`
    const dueDate = `${month}-${String(dueDay).padStart(2, '0')}`
    const label = monthLabelFr(month)

    // 1. Baux cibles (actifs, non supprimés)
    let query = admin
      .from('leases')
      .select('id, rent_amount, charges_amount')
      .eq('status', 'active')
      .is('deleted_at', null)
    if (leaseId) query = query.eq('id', leaseId)

    const { data: leases, error: leaseErr } = await query
    if (leaseErr) throw leaseErr
    if (!leases || leases.length === 0) {
      return { ok: true, data: { created: 0, skipped: 0, charges: [] } }
    }

    const leaseIds = leases.map((l) => l.id)

    // 2. Échéances déjà présentes pour ce mois (anti-doublon applicatif)
    const { data: existing, error: exErr } = await admin
      .from('rent_charges')
      .select('lease_id, type')
      .eq('period', period)
      .in('lease_id', leaseIds)
      .is('deleted_at', null)
    if (exErr) throw exErr

    const existingKey = new Set((existing ?? []).map((e) => `${e.lease_id}:${e.type}`))

    // 3. Construit les lignes manquantes
    const rows: Array<Record<string, unknown>> = []
    for (const l of leases) {
      if (!existingKey.has(`${l.id}:rent`)) {
        rows.push({
          lease_id: l.id,
          due_date: dueDate,
          period,
          label: `Loyer ${label}`,
          amount: round2(l.rent_amount),
          type: 'rent',
        })
      }
      if (
        includeCharges &&
        Number(l.charges_amount) > 0 &&
        !existingKey.has(`${l.id}:charges`)
      ) {
        rows.push({
          lease_id: l.id,
          due_date: dueDate,
          period,
          label: `Charges ${label}`,
          amount: round2(l.charges_amount),
          type: 'charges',
        })
      }
    }

    const rentToCreate = rows.filter((r) => r.type === 'rent').length
    const skipped = leases.length - rentToCreate

    if (rows.length === 0) {
      return { ok: true, data: { created: 0, skipped, charges: [] } }
    }

    // 4. Insertion. Le partial unique index protège en dernier recours.
    const { data: inserted, error: insErr } = await admin
      .from('rent_charges')
      .insert(rows)
      .select()
    if (insErr) throw insErr

    revalidatePath('/admin/loyers') // adapte le chemin à ton arborescence
    return {
      ok: true,
      data: {
        created: inserted?.length ?? 0,
        skipped,
        charges: (inserted ?? []) as RentCharge[],
      },
    }
  } catch (e) {
    return toActionError(e)
  }
}
