'use server'

import { z } from 'zod'
import { zuuid } from '@/lib/zutil'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/guards'
import { createUserClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { toActionError } from '@/lib/server-helpers'
import type { ActionResult, Message, MessageThread } from '@/lib/types'

// ===========================================================================
// sendMessage — poste un message dans un fil EXISTANT
// ===========================================================================
const SendMessageInput = z.object({
  threadId: zuuid(),
  content: z.string().min(1, 'Message vide').max(4000),
})

export type SendMessageInput = z.input<typeof SendMessageInput>

/**
 * SÉCURITÉ : client UTILISATEUR. La RLS `messages_insert` impose déjà
 *    sender_id = auth.uid()  ET  is_thread_participant(thread_id)
 * → impossible d'écrire dans un fil dont on n'est pas membre. On pré-vérifie
 *   l'appartenance au fil pour un message d'erreur clair, mais la RLS reste
 *   l'autorité. sender_id est forcé côté serveur (jamais depuis l'input).
 */
export async function sendMessage(
  input: SendMessageInput,
): Promise<ActionResult<Message>> {
  try {
    const { threadId, content } = SendMessageInput.parse(input)
    const me = await requireUser()
    const supabase = await createUserClient()

    // Pré-contrôle : suis-je participant ? (la RLS participants_select ne me
    // laisse voir cette ligne que si je suis membre du fil.)
    const { data: membership, error: memErr } = await supabase
      .from('thread_participants')
      .select('id')
      .eq('thread_id', threadId)
      .eq('profile_id', me.id)
      .maybeSingle()
    if (memErr) throw memErr
    if (!membership) {
      return { ok: false, error: 'Vous ne participez pas à cette conversation.', code: 'forbidden' }
    }

    const { data: message, error } = await supabase
      .from('messages')
      .insert({ thread_id: threadId, sender_id: me.id, content })
      .select()
      .single()
    if (error) throw error

    revalidatePath(`/messages/${threadId}`) // adapte le chemin
    return { ok: true, data: message as Message }
  } catch (e) {
    return toActionError(e)
  }
}

// ===========================================================================
// startThread — (optionnel) ouvre un fil avec la régie et poste le 1er message
// ===========================================================================
const StartThreadInput = z
  .object({
    subject: z.string().max(200).optional(),
    propertyId: zuuid().optional(),
    leaseId: zuuid().optional(),
    firstMessage: z.string().min(1).max(4000),
  })
  .refine((v) => v.propertyId || v.leaseId, {
    message: 'Un fil doit être rattaché à un bien ou à un bail.',
    path: ['propertyId'],
  })

export type StartThreadInput = z.input<typeof StartThreadInput>

/**
 * SÉCURITÉ — motif "création côté serveur" :
 * La RLS réserve la création de threads/participants à l'admin. Pour permettre
 * à un locataire/propriétaire d'OUVRIR un fil avec la régie, on procède ainsi :
 *   1. on VÉRIFIE avec le client UTILISATEUR que l'appelant est bien partie
 *      prenante du bien/bail (il doit pouvoir le voir → RLS) ;
 *   2. seulement alors, on crée le fil avec le client service_role et on y
 *      ajoute comme participants l'appelant + tous les admins.
 * Le service_role n'est utilisé qu'APRÈS la vérification de la relation.
 */
export async function startThread(
  input: StartThreadInput,
): Promise<ActionResult<{ thread: MessageThread; message: Message }>> {
  try {
    const data = StartThreadInput.parse(input)
    const me = await requireUser()
    const supabase = await createUserClient()

    // 1. Vérification de la relation via la RLS (visibilité = relation)
    if (data.leaseId) {
      const { data: lease, error } = await supabase
        .from('leases')
        .select('id')
        .eq('id', data.leaseId)
        .maybeSingle()
      if (error) throw error
      if (!lease) return { ok: false, error: 'Bail introuvable ou accès refusé.', code: 'forbidden' }
    }
    if (data.propertyId) {
      const { data: property, error } = await supabase
        .from('properties')
        .select('id')
        .eq('id', data.propertyId)
        .maybeSingle()
      if (error) throw error
      if (!property) return { ok: false, error: 'Bien introuvable ou accès refusé.', code: 'forbidden' }
    }

    // 2. Création côté serveur (service_role) — relation déjà validée
    const admin = createAdminClient()

    const { data: thread, error: threadErr } = await admin
      .from('message_threads')
      .insert({
        subject: data.subject ?? null,
        property_id: data.propertyId ?? null,
        lease_id: data.leaseId ?? null,
      })
      .select()
      .single()
    if (threadErr) throw threadErr

    // Participants : l'appelant + tous les admins actifs
    const { data: admins, error: adminsErr } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .is('deleted_at', null)
    if (adminsErr) throw adminsErr

    const participantIds = Array.from(new Set([me.id, ...(admins ?? []).map((a) => a.id)]))
    const { error: partErr } = await admin
      .from('thread_participants')
      .insert(participantIds.map((profile_id) => ({ thread_id: thread.id, profile_id })))
    if (partErr) throw partErr

    // Premier message (envoyé au nom de l'appelant)
    const { data: message, error: msgErr } = await admin
      .from('messages')
      .insert({ thread_id: thread.id, sender_id: me.id, content: data.firstMessage })
      .select()
      .single()
    if (msgErr) throw msgErr

    revalidatePath('/messages') // adapte le chemin
    return { ok: true, data: { thread: thread as MessageThread, message: message as Message } }
  } catch (e) {
    return toActionError(e)
  }
}
