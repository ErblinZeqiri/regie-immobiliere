import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Client Supabase "utilisateur" pour les Server Components / Server Actions.
 *
 * SÉCURITÉ : ce client porte le JWT de l'utilisateur connecté (via les cookies).
 * Toutes ses requêtes sont donc soumises à la RLS. C'est le client à utiliser
 * PAR DÉFAUT — il ne peut jamais voir/écrire au-delà des droits de l'utilisateur.
 */
export async function createUserClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // Peut échouer si appelé depuis un Server Component (lecture seule).
          // Sans conséquence : le refresh de session se fait via le middleware.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            /* noop */
          }
        },
      },
    },
  )
}
