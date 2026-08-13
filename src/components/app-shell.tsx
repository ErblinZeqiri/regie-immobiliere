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
  Menu,
  X,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { logout } from '@/actions/auth'

// Map nom -> composant : garde les props (NavItem) sérialisables entre
// Server Component (layouts) et ce Client Component.
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

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  const NavList = () => (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {nav.map((item) => {
        const Icon = ICONS[item.icon]
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive(item.href)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  const Footer = () => (
    <div className="border-t p-3">
      {userName && (
        <p className="truncate px-2 pb-2 text-xs text-muted-foreground">
          Connecté : <span className="font-medium text-foreground">{userName}</span>
        </p>
      )}
      <form action={logout}>
        <Button type="submit" variant="outline" className="w-full justify-start gap-2">
          <LogOut className="h-4 w-4" aria-hidden />
          Déconnexion
        </Button>
      </form>
    </div>
  )

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <Link
          href={homeHref}
          className="flex h-16 items-center gap-2 border-b px-4 font-semibold"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" aria-hidden />
          </span>
          <span>{title}</span>
        </Link>
        <NavList />
        <Footer />
      </aside>

      {/* Barre supérieure mobile */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-semibold">{title}</span>
        <form action={logout}>
          <Button type="submit" size="icon" variant="ghost" aria-label="Déconnexion">
            <LogOut className="h-5 w-5" />
          </Button>
        </form>
      </div>

      {/* Sidebar mobile (overlay) */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <span className="font-semibold">{title}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer le menu"
                className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
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
      <div className="md:pl-64">
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
