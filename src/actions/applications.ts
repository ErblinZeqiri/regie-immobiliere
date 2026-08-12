'use server'

import { z } from 'zod'
import { zuuid } from '@/lib/zutil'
import { createUserClient } from '@/lib/supabase/server'
import { toActionError } from '@/lib/server-helpers'
import type { ActionResult } from '@/lib/types'

const SubmitApplicationInput = z.object({
  propertyId: zuuid().optional(),
  fullName: z.string().min(2, 'Nom trop court').max(120),
  email: z.string().email('E-mail invalide'),
  phone: z.string().max(40).optional(),
  message: z.string().max(2000).optional(),
})

export type SubmitApplicationInput = z.input<typeof SubmitApplicationInput>

/**
 * submitApplication — candidature/contact depuis une annonce publique.
 *
 * SÉCURITÉ : client UTILISATEUR (anon possible). La RLS `applications_public_insert`
 * n'autorise l'insertion que pour un bien réellement en annonce publique
 * (ou sans bien) — impossible de spammer des property_id privés. Personne, à
 * part l'admin, ne peut RELIRE les candidatures (aucun grant/policy select public).
 */
export async function submitApplication(
  input: SubmitApplicationInput,
): Promise<ActionResult<null>> {
  try {
    const data = SubmitApplicationInput.parse(input)
    const supabase = await createUserClient()

    const { error } = await supabase.from('applications').insert({
      property_id: data.propertyId ?? null,
      full_name: data.fullName,
      email: data.email,
      phone: data.phone ?? null,
      message: data.message ?? null,
    })
    if (error) throw error

    return { ok: true, data: null }
  } catch (e) {
    return toActionError(e)
  }
}
