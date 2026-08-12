import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * updateSession — pattern officiel @supabase/ssr pour le middleware.
 *
 * Rôle : rafraîchir le token d'authentification à chaque requête (les Server
 * Components ne peuvent pas écrire de cookies ; c'est donc ici que le refresh
 * se propage au navigateur ET au backend).
 *
 * ⚠️ SÉCURITÉ : on appelle TOUJOURS supabase.auth.getUser() (jamais getSession()
 * dans le middleware) : getUser() revalide le JWT auprès du serveur Auth de
 * Supabase, alors que getSession() se contente de lire le cookie (falsifiable).
 *
 * Renvoie l'objet response (à retourner tel quel pour garder les cookies en
 * phase), le client, et l'utilisateur validé.
 */
export async function updateSession(request: NextRequest): Promise<{
  supabase: SupabaseClient
  supabaseResponse: NextResponse
  user: User | null
}> {
  // Réponse "pass-through" par défaut ; réécrite si des cookies changent.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Écrit les cookies à la fois sur la requête (pour la suite du
          // traitement) et sur la réponse (pour le navigateur).
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // NE RIEN insérer entre createServerClient et getUser() : cela pourrait
  // provoquer des déconnexions aléatoires (recommandation officielle Supabase).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabase, supabaseResponse, user }
}
