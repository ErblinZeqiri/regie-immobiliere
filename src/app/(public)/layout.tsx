import type { ReactNode } from 'react'
import Link from 'next/link'
import { PublicHeader } from '@/components/public-header'

/**
 * Layout des pages PUBLIQUES (annonces, contact, accueil…).
 * Le route group (public) n'affecte pas l'URL : /annonces reste /annonces.
 * Aucune protection ici — ces pages sont accessibles sans authentification.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <div className="flex-1">{children}</div>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} Régie Ferizaj — Ferizaj, Kosovo</p>
          <nav className="flex items-center gap-4">
            <Link href="/annonces" className="hover:text-foreground">
              Annonces
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Connexion
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
