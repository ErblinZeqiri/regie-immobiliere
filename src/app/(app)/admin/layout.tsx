import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createUserClient } from '@/lib/supabase/server'
import { AppShell, type NavItem } from '@/components/app-shell'

const NAV: NavItem[] = [
  { href: '/admin', label: 'Tableau de bord', icon: 'dashboard' },
  { href: '/admin/biens', label: 'Biens', icon: 'building' },
  { href: '/admin/proprietaires', label: 'Propriétaires', icon: 'users' },
  { href: '/admin/locataires', label: 'Locataires', icon: 'users' },
  { href: '/admin/baux', label: 'Baux', icon: 'file' },
  { href: '/admin/loyers', label: 'Loyers', icon: 'euro' },
  { href: '/admin/candidatures', label: 'Candidatures', icon: 'inbox' },
  { href: '/admin/signalements', label: 'Signalements', icon: 'wrench' },
  { href: '/admin/messages', label: 'Messages', icon: 'message' },
]

/**
 * SÉCURITÉ : contrôle du rôle côté serveur (en plus du middleware). Le layout
 * étant un Server Component, un rôle non-admin est redirigé avant tout rendu.
 * La sécurité des DONNÉES reste assurée par la RLS.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createUserClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirectedFrom=/admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') redirect('/')

  return (
    <AppShell title="Admin" nav={NAV} userName={profile.full_name}>
      {children}
    </AppShell>
  )
}
