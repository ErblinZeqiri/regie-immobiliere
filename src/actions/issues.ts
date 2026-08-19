'use server'

import { z } from 'zod'
import { zuuid } from '@/lib/zutil'
import { revalidatePath } from 'next/cache'
import { requireAdmin, requireUser } from '@/lib/auth/guards'
import { createUserClient } from '@/lib/supabase/server'
import { toActionError } from '@/lib/server-helpers'
import type { ActionResult, Issue, IssuePhoto } from '@/lib/types'

// ===========================================================================
// createIssue — LOCATAIRE ou PROPRIÉTAIRE d'un bien crée un signalement
// ===========================================================================
const CreateIssueInput = z.object({
  propertyId: zuuid(),
  leaseId: zuuid().optional(),
  title: z.string().min(3, 'Titre trop court').max(150),
  description: z.string().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
})

export type CreateIssueInput = z.input<typeof CreateIssueInput>

/**
 * SÉCURITÉ : client UTILISATEUR (pas service_role). La RLS `issues_insert`
 * impose déjà :
 *    created_by = auth.uid()  ET  (rents_property(propertyId) OU owns_property(propertyId))
 * → un utilisateur ne peut créer un signalement que sur un bien qu'il LOUE ou
 *   POSSÈDE. On force created_by côté serveur (jamais depuis l'input client).
 *
 * Les photos s'ajoutent après via addIssuePhotos (upload Storage géré à part).
 */
export async function createIssue(
  input: CreateIssueInput,
): Promise<ActionResult<Issue>> {
  try {
    const data = CreateIssueInput.parse(input)
    const me = await requireUser()
    const supabase = await createUserClient()

    // Pré-contrôle lisible : le bien doit être visible par l'utilisateur
    // (la RLS de properties ne l'expose qu'à son proprio / locataire / admin).
    const { data: property, error: propErr } = await supabase
      .from('properties')
      .select('id')
      .eq('id', data.propertyId)
      .maybeSingle()
    if (propErr) throw propErr
    if (!property) {
      return { ok: false, error: 'Bien introuvable ou accès refusé.', code: 'forbidden' }
    }

    const { data: issue, error } = await supabase
      .from('issues')
      .insert({
        property_id: data.propertyId,
        lease_id: data.leaseId ?? null,
        created_by: me.id, // JAMAIS depuis l'input : c'est l'utilisateur authentifié
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        status: 'open',
      })
      .select()
      .single()
    if (error) throw error

    revalidatePath('/signalements') // adapte le chemin
    return { ok: true, data: issue as Issue }
  } catch (e) {
    return toActionError(e)
  }
}

// ===========================================================================
// addIssuePhotos — rattache des fichiers déjà uploadés à un signalement
// ===========================================================================
const AddIssuePhotosInput = z.object({
  issueId: zuuid(),
  /** Chemins Storage (bucket privé) des photos déjà uploadées, pas des URLs publiques. */
  fileUrls: z.array(z.string().min(1).max(500)).min(1).max(10),
})

export type AddIssuePhotosInput = z.input<typeof AddIssuePhotosInput>

/**
 * SÉCURITÉ : client UTILISATEUR. La RLS `issue_photos_insert` exige que
 * l'utilisateur soit le CRÉATEUR du signalement (ou admin). On pré-vérifie la
 * visibilité du signalement pour renvoyer une erreur claire.
 */
export async function addIssuePhotos(
  input: AddIssuePhotosInput,
): Promise<ActionResult<IssuePhoto[]>> {
  try {
    const { issueId, fileUrls } = AddIssuePhotosInput.parse(input)
    await requireUser()
    const supabase = await createUserClient()

    const { data: issue, error: issueErr } = await supabase
      .from('issues')
      .select('id')
      .eq('id', issueId)
      .maybeSingle()
    if (issueErr) throw issueErr
    if (!issue) {
      return { ok: false, error: 'Signalement introuvable ou accès refusé.', code: 'forbidden' }
    }

    const rows = fileUrls.map((file_url) => ({ issue_id: issueId, file_url }))
    const { data: photos, error } = await supabase
      .from('issue_photos')
      .insert(rows)
      .select()
    if (error) throw error

    revalidatePath('/signalements') // adapte le chemin
    return { ok: true, data: (photos ?? []) as IssuePhoto[] }
  } catch (e) {
    return toActionError(e)
  }
}

// ===========================================================================
// setIssueStatus — ADMIN change le statut d'un signalement
// ===========================================================================
const SetIssueStatusInput = z.object({
  id: zuuid(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed', 'archived']),
})

export async function setIssueStatus(
  input: z.input<typeof SetIssueStatusInput>,
): Promise<ActionResult<null>> {
  try {
    const { id, status } = SetIssueStatusInput.parse(input)
    await requireAdmin()
    const supabase = await createUserClient() // RLS issues_admin_all autorise l'admin

    const { error } = await supabase.from('issues').update({ status }).eq('id', id)
    if (error) throw error

    revalidatePath('/admin/signalements')
    return { ok: true, data: null }
  } catch (e) {
    return toActionError(e)
  }
}
