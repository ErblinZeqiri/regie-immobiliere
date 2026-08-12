import 'server-only'
import { createUserClient } from '@/lib/supabase/server'
import type { AppRole } from '@/lib/types'

/** Erreur d'autorisation — transformée en ActionResult par toActionError(). */
export class AuthzError extends Error {
  code: string
  constructor(message: string, code = 'forbidden') {
    super(message)
    this.name = 'AuthzError'
    this.code = code
  }
}

export interface CurrentProfile {
  id: string
  role: AppRole
}

/**
 * Renvoie le profil de l'utilisateur connecté, ou null.
 * `auth.getUser()` valide le JWT côté serveur (ne pas se fier à getSession()).
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createUserClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // La RLS autorise l'utilisateur à lire sa propre ligne profiles.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .is('deleted_at', null)
    .single()

  if (error || !data) return null
  return data as CurrentProfile
}

/** Exige un utilisateur connecté (n'importe quel rôle). */
export async function requireUser(): Promise<CurrentProfile> {
  const profile = await getCurrentProfile()
  if (!profile) throw new AuthzError('Authentification requise', 'unauthenticated')
  return profile
}

/** Exige le rôle admin. À appeler AVANT tout usage du client service_role. */
export async function requireAdmin(): Promise<CurrentProfile> {
  const profile = await requireUser()
  if (profile.role !== 'admin') {
    throw new AuthzError('Action réservée à l’administrateur')
  }
  return profile
}
