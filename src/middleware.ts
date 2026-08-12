import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import type { AppRole } from '@/lib/types'

// ---------------------------------------------------------------------------
// Configuration des routes
// ---------------------------------------------------------------------------

/** Page d'accueil de chaque rôle (redirection après login / mauvais rôle). */
const ROLE_HOME: Record<AppRole, string> = {
  admin: '/admin',
  owner: '/proprietaire',
  tenant: '/locataire',
}

/** Route publique de connexion. */
const LOGIN_PATH = '/login'

/**
 * Préfixes protégés -> rôles autorisés.
 * Tout ce qui n'est PAS listé ici est PUBLIC (/, annonces, login, auth…).
 * L'admin est ajouté partout : il a accès à tous les espaces.
 */
const PROTECTED: Array<{ prefix: string; roles: AppRole[] }> = [
  { prefix: '/admin', roles: ['admin'] },
  { prefix: '/proprietaire', roles: ['owner', 'admin'] },
  { prefix: '/owner', roles: ['owner', 'admin'] },
  { prefix: '/locataire', roles: ['tenant', 'admin'] },
  { prefix: '/tenant', roles: ['tenant', 'admin'] },
]

function matchProtected(pathname: string) {
  return PROTECTED.find(
    (p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`),
  )
}

/**
 * Crée une redirection en CONSERVANT les cookies rafraîchis par updateSession.
 * Sans cette recopie, le refresh de session serait perdu sur les redirections.
 */
function redirectKeepingCookies(url: URL, base: NextResponse): NextResponse {
  const res = NextResponse.redirect(url)
  base.cookies.getAll().forEach((cookie) => res.cookies.set(cookie))
  return res
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  // 1. Rafraîchit toujours la session (pattern officiel), même sur route publique.
  const { supabase, supabaseResponse, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  // 2. Utilisateur déjà connecté qui atterrit sur /login -> vers son espace.
  if (user && pathname === LOGIN_PATH) {
    const role = await fetchRole(supabase, user.id)
    const url = request.nextUrl.clone()
    url.pathname = role ? ROLE_HOME[role] : '/'
    url.search = ''
    return redirectKeepingCookies(url, supabaseResponse)
  }

  const match = matchProtected(pathname)

  // 3. Route publique -> laisser passer (session déjà rafraîchie).
  if (!match) return supabaseResponse

  // 4. Route protégée, non connecté -> login (en mémorisant la destination).
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = LOGIN_PATH
    url.search = ''
    url.searchParams.set('redirectedFrom', pathname)
    return redirectKeepingCookies(url, supabaseResponse)
  }

  // 5. Connecté : on vérifie le RÔLE.
  //    Le rôle vit dans profiles (source de vérité). On paie ici une requête DB
  //    par accès à une route protégée.
  //    OPTIMISATION possible : injecter `role` dans les custom claims du JWT via
  //    un Auth Hook Supabase, puis le lire dans user.app_metadata — zéro requête.
  const role = await fetchRole(supabase, user.id)

  if (!role || !match.roles.includes(role)) {
    // Mauvais rôle -> on renvoie l'utilisateur vers SON espace (pas de fuite
    // d'info sur l'existence de la ressource). À défaut de rôle -> accueil.
    const url = request.nextUrl.clone()
    url.pathname = role ? ROLE_HOME[role] : '/'
    url.search = ''
    return redirectKeepingCookies(url, supabaseResponse)
  }

  // 6. OK. RAPPEL : ceci n'est qu'un filtre UX. La sécurité réelle des données
  //    est assurée par la RLS + les guards serveur (requireAdmin, etc.).
  return supabaseResponse
}

/** Lit le rôle applicatif de l'utilisateur (RLS : il peut voir sa propre ligne). */
async function fetchRole(
  supabase: Awaited<ReturnType<typeof updateSession>>['supabase'],
  userId: string,
): Promise<AppRole | null> {
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .is('deleted_at', null)
    .single()
  return (data?.role as AppRole | undefined) ?? null
}

// ---------------------------------------------------------------------------
// Matcher : on exécute le middleware partout SAUF les assets statiques.
// (Il faut qu'il tourne sur les routes publiques aussi, pour le refresh de session.)
// ---------------------------------------------------------------------------
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
}
