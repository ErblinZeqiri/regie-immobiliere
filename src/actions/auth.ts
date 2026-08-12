'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { createUserClient } from '@/lib/supabase/server'
import type { AppRole } from '@/lib/types'

/** État renvoyé au formulaire (consommé via useActionState). */
export type LoginState = { error: string | null }

const ROLE_HOME: Record<AppRole, string> = {
  admin: '/admin',
  owner: '/proprietaire',
  tenant: '/locataire',
}

const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/**
 * N'autorise QUE des chemins internes (anti open-redirect) : un attaquant ne
 * doit pas pouvoir forger ?redirectedFrom=//evil.com pour détourner la victime.
 */
function safeInternalPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  return value
}

/**
 * login — connexion email + mot de passe.
 *
 * SÉCURITÉ :
 *  - client UTILISATEUR (@supabase/ssr) : signInWithPassword pose les cookies
 *    de session côté serveur (lisibles ensuite par le middleware et la RLS).
 *  - message d'erreur GÉNÉRIQUE : on ne distingue pas "e-mail inconnu" de
 *    "mauvais mot de passe" (évite l'énumération de comptes).
 *  - redirection selon le rôle lu dans profiles (source de vérité).
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginInput.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: 'Adresse e-mail ou mot de passe invalide.' }
  }

  const supabase = await createUserClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error || !data.user) {
    return { error: 'Identifiants incorrects. Vérifiez votre e-mail et votre mot de passe.' }
  }

  // Destination : le chemin mémorisé par le middleware s'il est sûr, sinon
  // l'espace correspondant au rôle.
  const requested = safeInternalPath(formData.get('redirectTo'))
  let destination = requested ?? '/'
  if (!requested) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()
    const role = profile?.role as AppRole | undefined
    destination = role ? ROLE_HOME[role] : '/'
  }

  // redirect() lève NEXT_REDIRECT (géré par Next) : ne rien mettre après.
  redirect(destination)
}

/**
 * logout — déconnexion. Efface la session (cookies) puis renvoie vers /login.
 * Utilisable directement comme `action` d'un <form>.
 */
export async function logout(): Promise<void> {
  const supabase = await createUserClient()
  await supabase.auth.signOut()
  redirect('/login')
}
