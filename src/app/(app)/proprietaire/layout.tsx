import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createUserClient } from '@/lib/supabase/server'
import { AppShell, type NavItem } from '@/components/app-shell'

const NAV: NavItem[] = [
  { href: '/proprietaire', label: 'Tableau de bord', icon: 'dashboard' },
  { href: '/proprietaire/biens', label: 'Mes biens', icon: 'building' },
  { href: '/proprietaire/loyers', label: 'Loyers', icon: 'euro' },
  { href: '/proprietaire/signalements', label: 'Signalements', icon: 'wrench' },
  { href: '/proprietaire/documents', label: 'Documents', icon: 'file' },
  { href: '/proprietaire/messages', label: 'Messages', icon: 'message' },
]

/** SÉCURITÉ : accès owner (l'admin est aussi autorisé, cohérent avec le middleware). */
export default async function ProprietaireLayout({ children }: { children: ReactNode }) {
  const supabase = await createUserClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirectedFrom=/proprietaire')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) redirect('/')

  return (
    <AppShell title="Espace propriétaire" nav={NAV} userName={profile.full_name}>
      {children}
    </AppShell>
  )
}
