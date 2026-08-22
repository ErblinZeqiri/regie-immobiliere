'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  Users,
  FileText,
  Wrench,
  MessageSquare,
  LayoutDashboard,
  Banknote,
  Home,
  Receipt,
  Inbox,
  ArrowLeftRight,
  Settings,
  Store,
  Menu,
  X,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { logout } from '@/actions/auth'

const BRAND = 'Pron Gérance'

const ICONS = {
  dashboard: LayoutDashboard,
  building: Building2,
  users: Users,
  file: FileText,
  euro: Banknote,
  wrench: Wrench,
  message: MessageSquare,
  home: Home,
  receipt: Receipt,
  inbox: Inbox,
  reconcile: ArrowLeftRight,
  settings: Settings,
} as const

export type NavItem = {
  href: string
  label: string
  icon: keyof typeof ICONS
}

export function AppShell({
  title,
  nav,
  userName,
  children,
}: {
  title: string
  nav: NavItem[]
  userName?: string | null
  children: ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const homeHref = nav[0]?.href ?? '/'

  const isActive = (href: string) =>
    pathname === href || (href !== homeHref && pathname.startsWith(`${href}/`))

  const Brand = () => (
    <Link
      href={homeHref}
      onClick={() => setOpen(false)}
      className="block border-b border-sidebar-border px-5 py-4"
    >
      <span className="font-display block text-[1.05rem] leading-none font-semibold text-foreground">
        {BRAND}
      </span>
      <span className="mt-1.5 block text-[10px] font-semibold tracking-[0.18em] text-primary uppercase">
        {title}
      </span>
    </Link>
  )

  const NavList = () => (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {nav.map((item) => {
        const Icon = ICONS[item.icon]
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              'relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-accent font-medium text-primary'
                : 'text-muted-foreground hover:bg-black/[0.03] hover:text-foreground',
            )}
          >
            {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />}
            <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  const Footer = () => (
    <div className="space-y-0.5 border-t border-sidebar-border p-3">
      {userName && (
        <p className="truncate px-3 pb-1 text-[11px] text-muted-foreground">{userName}</p>
      )}
      <Link
        href="/annonces"
        onClick={() => setOpen(false)}
        className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-black/[0.03] hover:text-foreground"
      >
        <Store className="h-4 w-4" aria-hidden />
        Voir les annonces
      </Link>
      <form action={logout}>
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-black/[0.03] hover:text-foreground"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Déconnexion
        </button>
      </form>
    </div>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <Brand />
        <NavList />
        <Footer />
      </aside>

      {/* Barre supérieure mobile */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background px-4 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-display text-sm font-semibold">{BRAND}</span>
        <form action={logout}>
          <Button type="submit" size="icon" variant="ghost" aria-label="Déconnexion">
            <LogOut className="h-5 w-5" />
          </Button>
        </form>
      </div>

      {/* Sidebar mobile (overlay) */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-foreground/25" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-60 flex-col border-r border-sidebar-border bg-sidebar shadow-lg">
            <div className="flex items-start justify-between">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer le menu"
                className="mt-4 mr-3 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList />
            <Footer />
          </aside>
        </div>
      )}

      {/* Contenu principal */}
      <div className="md:pl-60">
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
