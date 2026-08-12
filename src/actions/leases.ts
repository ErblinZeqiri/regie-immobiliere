'use server'

import { z } from 'zod'
import { zuuid } from '@/lib/zutil'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { monthLabelFr, round2, toActionError } from '@/lib/server-helpers'
import type { ActionResult, Lease, RentCharge } from '@/lib/types'

const CreateLeaseInput = z
  .object({
    propertyId: zuuid(),
    tenantId: zuuid(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    rentAmount: z.number().positive('Le loyer doit être positif'),
    chargesAmount: z.number().min(0).default(0),
    depositAmount: z.number().min(0).default(0),
    /** Génère l'échéance du mois de début. */
    generateFirstCharge: z.boolean().default(true),
    dueDay: z.number().int().min(1).max(28).default(5),
    /** Passe le bien en statut 'rented'. */
    markPropertyRented: z.boolean().default(true),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: 'La date de fin doit être postérieure à la date de début',
    path: ['endDate'],
  })

export type CreateLeaseInput = z.input<typeof CreateLeaseInput>

interface CreateLeaseResult {
  lease: Lease
  firstCharge: RentCharge | null
}

/**
 * createLease — crée un bail (+ éventuellement la première échéance).
 *
 * SÉCURITÉ : ADMIN uniquement (la RLS `leases_admin_all` réserve déjà l'écriture
 * à l'admin ; on double d'un requireAdmin() puisqu'on passe par service_role).
 *
 * Vérifie l'existence du bien et que le profil ciblé est bien un 'tenant'.
 */
export async function createLease(
  input: CreateLeaseInput,
): Promise<ActionResult<CreateLeaseResult>> {
  try {
    const data = CreateLeaseInput.parse(input)
    await requireAdmin()
    const admin = createAdminClient()

    // 1. Le bien existe ?
    const { data: property, error: propErr } = await admin
      .from('properties')
      .select('id, status')
      .eq('id', data.propertyId)
      .is('deleted_at', null)
      .maybeSingle()
    if (propErr) throw propErr
    if (!property) return { ok: false, error: 'Bien introuvable.', code: 'not_found' }

    // 2. Le locataire existe et a bien le rôle 'tenant' ?
    const { data: tenant, error: tenantErr } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', data.tenantId)
      .is('deleted_at', null)
      .maybeSingle()
    if (tenantErr) throw tenantErr
    if (!tenant) return { ok: false, error: 'Locataire introuvable.', code: 'not_found' }
    if (tenant.role !== 'tenant') {
      return { ok: false, error: 'Le profil ciblé n’est pas un locataire.', code: 'invalid_role' }
    }

    // 3. Création du bail
    const { data: lease, error: leaseErr } = await admin
      .from('leases')
      .insert({
        property_id: data.propertyId,
        tenant_id: data.tenantId,
        start_date: data.startDate,
        end_date: data.endDate ?? null,
        rent_amount: round2(data.rentAmount),
        charges_amount: round2(data.chargesAmount),
        deposit_amount: round2(data.depositAmount),
        status: 'active',
      })
      .select()
      .single()
    if (leaseErr) throw leaseErr

    // 4. Première échéance (optionnelle) — on ignore un éventuel doublon.
    let firstCharge: RentCharge | null = null
    if (data.generateFirstCharge) {
      const month = data.startDate.slice(0, 7) // 'YYYY-MM'
      const period = `${month}-01`
      const dueDate = `${month}-${String(data.dueDay).padStart(2, '0')}`

      const { data: charge, error: chargeErr } = await admin
        .from('rent_charges')
        .insert({
          lease_id: lease.id,
          due_date: dueDate,
          period,
          label: `Loyer ${monthLabelFr(month)}`,
          amount: round2(data.rentAmount),
          type: 'rent',
        })
        .select()
        .single()
      if (chargeErr && chargeErr.code !== '23505') throw chargeErr
      firstCharge = (charge as RentCharge | null) ?? null
    }

    // 5. Marque le bien loué
    if (data.markPropertyRented && property.status !== 'rented') {
      const { error: updErr } = await admin
        .from('properties')
        .update({ status: 'rented' })
        .eq('id', data.propertyId)
      if (updErr) throw updErr
    }

    revalidatePath('/admin/baux') // adapte le chemin
    return { ok: true, data: { lease: lease as Lease, firstCharge } }
  } catch (e) {
    return toActionError(e)
  }
}
