import Link from 'next/link'
import { Plus, Eye, EyeOff } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

interface Row {
  id: string
  reference: string | null
  title: string
  city: string | null
  status: string
  is_public: boolean
  owner: { full_name: string | null } | null
}

const STATUS: Record<string, { label: string; className?: string; variant?: 'outline' | 'secondary' }> = {
  rented: { label: 'Loué', className: 'border-transparent bg-green-600 text-white' },
  available: { label: 'Disponible', variant: 'outline', className: 'border-amber-500 text-amber-600' },
  maintenance: { label: 'Entretien', variant: 'secondary' },
  sold: { label: 'Vendu', variant: 'secondary' },
}

export default async function AdminBiensPage() {
  const supabase = await createUserClient()
  const { data } = await supabase
    .from('properties')
    .select('id, reference, title, city, status, is_public, owner:profiles(full_name)')
    .is('deleted_at', null)
    .order('reference', { ascending: true })
  const rows = (data ?? []) as unknown as Row[]

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Biens</h1>
          <p className="text-sm text-muted-foreground">{rows.length} bien{rows.length > 1 ? 's' : ''}</p>
        </div>
        <Button className="gap-2" render={<Link href="/admin/biens/nouveau" />}>
          <Plus className="h-4 w-4" />
          Nouveau bien
        </Button>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Aucun bien. Créez le premier.
        </div>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Référence</th>
                  <th className="p-3 font-medium">Titre</th>
                  <th className="p-3 font-medium">Ville</th>
                  <th className="p-3 font-medium">Propriétaire</th>
                  <th className="p-3 font-medium">Statut</th>
                  <th className="p-3 font-medium">Annonce</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const s = STATUS[r.status] ?? { label: r.status, variant: 'outline' as const }
                  return (
                    <tr key={r.id} className="hover:bg-muted/40">
                      <td className="p-3 font-medium">{r.reference ?? '—'}</td>
                      <td className="p-3">{r.title}</td>
                      <td className="p-3 text-muted-foreground">{r.city ?? '—'}</td>
                      <td className="p-3 text-muted-foreground">{r.owner?.full_name ?? '—'}</td>
                      <td className="p-3">
                        <Badge variant={s.variant} className={s.className}>
                          {s.label}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {r.is_public ? (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <Eye className="h-4 w-4" /> Public
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <EyeOff className="h-4 w-4" /> Privé
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          render={<Link href={`/admin/biens/${r.id}`} />}
                        >
                          Modifier
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
