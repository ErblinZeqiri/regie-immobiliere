import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UserAccountForm, type UserFormInitial } from '@/components/user-account-form'

type Role = 'owner' | 'tenant'

const LANG_LABELS: Record<string, string> = {
  sq: 'Shqip',
  fr: 'Français',
  de: 'Deutsch',
  en: 'English',
}

function meta(role: Role) {
  return role === 'owner'
    ? { list: '/admin/proprietaires', plural: 'Propriétaires', singular: 'propriétaire' }
    : { list: '/admin/locataires', plural: 'Locataires', singular: 'locataire' }
}

interface ProfileRow {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  preferred_language: string | null
}

// ---------------------------------------------------------------------------
// Liste + bouton "Nouveau"
// ---------------------------------------------------------------------------
export async function UsersList({ role }: { role: Role }) {
  const m = meta(role)
  const supabase = await createUserClient() // admin voit tous les profils (RLS)
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, preferred_language')
    .eq('role', role)
    .is('deleted_at', null)
    .order('full_name', { ascending: true })
  const rows = (data ?? []) as ProfileRow[]

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{m.plural}</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} compte{rows.length > 1 ? 's' : ''}
          </p>
        </div>
        <Button className="gap-2" render={<Link href={`${m.list}/nouveau`} />}>
          <Plus className="h-4 w-4" />
          Nouveau {m.singular}
        </Button>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Aucun {m.singular} pour le moment.
        </div>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Nom</th>
                  <th className="p-3 font-medium">E-mail</th>
                  <th className="p-3 font-medium">Téléphone</th>
                  <th className="p-3 font-medium">Langue</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="p-3 font-medium">{r.full_name ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">{r.email ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">{r.phone ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">
                      {r.preferred_language ? (LANG_LABELS[r.preferred_language] ?? r.preferred_language) : '—'}
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="outline" size="sm" render={<Link href={`${m.list}/${r.id}`} />}>
                        Modifier
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Carte de création
// ---------------------------------------------------------------------------
export function UserCreateCard({ role }: { role: Role }) {
  const m = meta(role)
  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={m.list}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux {m.plural.toLowerCase()}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Nouveau {m.singular}</CardTitle>
        </CardHeader>
        <CardContent>
          <UserAccountForm mode="create" role={role} />
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Édition
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function UserEdit({ role, id }: { role: Role; id: string }) {
  if (!UUID_RE.test(id)) notFound()
  const m = meta(role)
  const supabase = await createUserClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, preferred_language, role')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!profile || profile.role !== role) notFound()

  const initial: UserFormInitial = {
    id: profile.id,
    fullName: profile.full_name ?? '',
    email: profile.email ?? '',
    phone: profile.phone ?? '',
    preferredLanguage: (profile.preferred_language ?? 'sq') as UserFormInitial['preferredLanguage'],
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href={m.list}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux {m.plural.toLowerCase()}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{profile.full_name ?? 'Profil'}</CardTitle>
        </CardHeader>
        <CardContent>
          <UserAccountForm mode="edit" role={role} initial={initial} />
        </CardContent>
      </Card>
    </div>
  )
}
