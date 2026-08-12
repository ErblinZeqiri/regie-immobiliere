import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createUserClient } from '@/lib/supabase/server'
import { AppShell, type NavItem } from '@/components/app-shell'

const NAV: NavItem[] = [
  { href: '/locataire', label: 'Tableau de bord', icon: 'home' },
  { href: '/locataire/bail', label: 'Mon bail', icon: 'file' },
  { href: '/locataire/paiements', label: 'Paiements', icon: 'receipt' },
  { href: '/locataire/signalements', label: 'Signalements', icon: 'wrench' },
  { href: '/locataire/messages', label: 'Messages', icon: 'message' },
]

/** SÉCURITÉ : accès tenant (l'admin est aussi autorisé, cohérent avec le middleware). */
export default async function LocataireLayout({ children }: { children: ReactNode }) {
  const supabase = await createUserClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirectedFrom=/locataire')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  if (!profile || (profile.role !== 'tenant' && profile.role !== 'admin')) redirect('/')

  return (
    <AppShell title="Espace locataire" nav={NAV} userName={profile.full_name}>
      {children}
    </AppShell>
  )
}
