'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { toActionError } from '@/lib/server-helpers'
import type { ActionResult } from '@/lib/types'

const opt = () => z.string().trim().max(300).optional().or(z.literal('')).transform((v) => (v ? v : null))

const UpdateAgencyInput = z.object({
  legalName: z.string().trim().min(1, 'Le nom de la régie est requis').max(200),
  address: opt(),
  city: opt(),
  country: opt(),
  email: z.string().trim().max(200).email('Email invalide').optional().or(z.literal('')).transform((v) => (v ? v : null)),
  phone: opt(),
  iban: opt(),
  accountHolder: opt(),
  legalMentions: z.string().trim().max(1000).optional().or(z.literal('')).transform((v) => (v ? v : null)),
})

export type UpdateAgencyInput = z.input<typeof UpdateAgencyInput>

/**
 * Met à jour les paramètres de la régie (ligne unique id=1).
 * SÉCURITÉ : ADMIN uniquement. service_role après requireAdmin().
 */
export async function updateAgencySettings(input: UpdateAgencyInput): Promise<ActionResult<null>> {
  try {
    const d = UpdateAgencyInput.parse(input)
    const me = await requireAdmin()
    const admin = createAdminClient()

    const { error } = await admin.from('agency_settings').upsert({
      id: 1,
      legal_name: d.legalName,
      address: d.address,
      city: d.city,
      country: d.country,
      email: d.email,
      phone: d.phone,
      iban: d.iban,
      account_holder: d.accountHolder,
      legal_mentions: d.legalMentions,
      updated_at: new Date().toISOString(),
      updated_by: me.id,
    })
    if (error) throw error

    revalidatePath('/admin/parametres')
    return { ok: true, data: null }
  } catch (e) {
    return toActionError(e)
  }
}
