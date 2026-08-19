'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

const NAV_LINKS = [{ href: '/annonces', label: 'Annonces' }]

/** Nom de la régie — remplace par le tien. */
const BRAND = 'Régie Ferizaj'

const ROLE_HOME: Record<string, string> = {
  admin: '/admin',
  owner: '/proprietaire',
  tenant: '/locataire',
}

interface CurrentUser {
  name: string
  home: string
}

export function PublicHeader() {
  const [open, setOpen] = useState(false)
  const [me, setMe] = useState<CurrentUser | null>(null)

  // État de connexion détecté côté client → les pages publiques restent cachées.
  useEffect(() => {
    const supabase = createClient()
    let active = true
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!active || !user) return
      const { data } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .single()
      if (!active) return
      const role = data?.role ?? 'tenant'
      setMe({
        name: data?.full_name ?? user.email ?? 'Mon espace',
        home: ROLE_HOME[role] ?? '/',
      })
    })
    return () => {
      active = false
    }
  }, [])

  const initial = (me?.name ?? '?').trim().charAt(0).toUpperCase() || '?'

  const Avatar = ({ withName = false }: { withName?: boolean }) => (
    <Link href={me!.home} onClick={() => setOpen(false)} className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {initial}
      </span>
      {withName && <span className="text-sm font-medium">{me!.name}</span>}
    </Link>
  )

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo / marque */}
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-lg">{BRAND}</span>
        </Link>

        {/* Navigation desktop */}
        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          {me ? (
            <Avatar withName />
          ) : (
            <Button size="sm" render={<Link href="/login" />}>
              Connexion
            </Button>
          )}
        </nav>

        {/* Bouton menu mobile */}
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Menu mobile déroulant */}
      {open && (
        <nav className="border-t md:hidden">
          <div className="space-y-1 px-4 py-3 sm:px-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            {me ? (
              <Link
                href={me.home}
                onClick={() => setOpen(false)}
                className="mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {initial}
                </span>
                {me.name}
              </Link>
            ) : (
              <Button
                className="mt-2 w-full"
                render={<Link href="/login" onClick={() => setOpen(false)} />}
              >
                Connexion
              </Button>
            )}
          </div>
        </nav>
      )}
    </header>
  )
}
