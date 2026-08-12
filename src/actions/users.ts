'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { toActionError } from '@/lib/server-helpers'
import { zuuid } from '@/lib/zutil'
import type { ActionResult } from '@/lib/types'

const ROLE = z.enum(['owner', 'tenant']) // l'admin ne crée pas d'autres admins ici
const LANG = z.enum(['sq', 'fr', 'de', 'en'])

function listPath(role: 'owner' | 'tenant') {
  return role === 'owner' ? '/admin/proprietaires' : '/admin/locataires'
}

// ===========================================================================
// createUserAccount — ADMIN crée un compte propriétaire ou locataire
// ===========================================================================
const CreateUserInput = z.object({
  role: ROLE,
  fullName: z.string().min(2, 'Nom trop court').max(120),
  email: z.string().email('E-mail invalide'),
  phone: z.string().max(40).optional(),
  preferredLanguage: LANG.default('sq'),
  password: z.string().min(8, 'Au moins 8 caractères').max(72),
})
export type CreateUserInput = z.input<typeof CreateUserInput>

/**
 * SÉCURITÉ : ADMIN uniquement. Utilise l'API admin Supabase (service_role) pour
 * créer le compte auth, puis fixe le rôle/infos du profil. Le compte est
 * email_confirm = true → connexion immédiate avec le mot de passe fourni.
 */
export async function createUserAccount(
  input: CreateUserInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const data = CreateUserInput.parse(input)
    await requireAdmin()
    const admin = createAdminClient()

    // 1. Compte auth (le trigger handle_new_user crée le profil en rôle 'tenant')
    const { data: created, error } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    })
    if (error || !created.user) {
      const msg = error?.message ?? ''
      if (/already|exist|registered/i.test(msg)) {
        return { ok: false, error: 'Cet e-mail est déjà utilisé.', code: 'duplicate' }
      }
      return { ok: false, error: msg || 'Échec de la création du compte.' }
    }

    // 2. Fixe le rôle + infos (autorisé côté service_role via le trigger ajusté)
    const { error: profErr } = await admin
      .from('profiles')
      .update({
        role: data.role,
        full_name: data.fullName,
        phone: data.phone ?? null,
        preferred_language: data.preferredLanguage,
      })
      .eq('id', created.user.id)
    if (profErr) throw profErr

    revalidatePath(listPath(data.role))
    return { ok: true, data: { id: created.user.id } }
  } catch (e) {
    return toActionError(e)
  }
}

// ===========================================================================
// updateUserProfile — ADMIN modifie le profil (nom, téléphone, langue, rôle)
// ===========================================================================
const UpdateUserInput = z.object({
  id: zuuid(),
  role: ROLE,
  fullName: z.string().min(2).max(120),
  phone: z.string().max(40).optional(),
  preferredLanguage: LANG,
})
export type UpdateUserInput = z.input<typeof UpdateUserInput>

export async function updateUserProfile(
  input: UpdateUserInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const data = UpdateUserInput.parse(input)
    await requireAdmin()
    const admin = createAdminClient()

    const { error } = await admin
      .from('profiles')
      .update({
        role: data.role,
        full_name: data.fullName,
        phone: data.phone ?? null,
        preferred_language: data.preferredLanguage,
      })
      .eq('id', data.id)
    if (error) throw error

    revalidatePath(listPath(data.role))
    revalidatePath(`${listPath(data.role)}/${data.id}`)
    return { ok: true, data: { id: data.id } }
  } catch (e) {
    return toActionError(e)
  }
}
