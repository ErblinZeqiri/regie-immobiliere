import type { ReactNode } from 'react'
import Link from 'next/link'
import { PublicHeader, type PublicUser } from '@/components/public-header'
import { createUserClient } from '@/lib/supabase/server'

const ROLE_HOME: Record<string, string> = {
  admin: '/admin',
  owner: '/proprietaire',
  tenant: '/locataire',
}

/**
 * Layout des pages PUBLIQUES (accueil, annonces, détail…).
 * L'utilisateur connecté est lu CÔTÉ SERVEUR (fiable) puis transmis au header,
 * pour que le bouton « Connexion » laisse place à l'avatar dès qu'on est connecté.
 */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const supabase = await createUserClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let me: PublicUser | null = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .maybeSingle()
    const role = data?.role ?? 'tenant'
    me = {
      name: data?.full_name ?? user.email ?? 'Mon espace',
      home: ROLE_HOME[role] ?? '/',
    }
  }

  // Identité de la régie (vue publique, colonnes non sensibles).
  const { data: agency } = await supabase
    .from('agency_public')
    .select('legal_name, city, country, email')
    .maybeSingle()
  const brand = agency?.legal_name ?? 'Pron Gérance'
  const place = [agency?.city, agency?.country].filter(Boolean).join(', ') || 'Kosovo'

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader me={me} />

      <div className="flex-1">{children}</div>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} {brand} — {place}
            {agency?.email ? ` · ${agency.email}` : ''}
          </p>
          <nav className="flex items-center gap-4">
            <Link href="/annonces" className="hover:text-foreground">
              Annonces
            </Link>
            {me ? (
              <Link href={me.home} className="hover:text-foreground">
                Mon espace
              </Link>
            ) : (
              <Link href="/login" className="hover:text-foreground">
                Connexion
              </Link>
            )}
          </nav>
        </div>
      </footer>
    </div>
  )
}
