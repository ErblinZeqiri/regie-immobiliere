import { Mail, Phone } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ApplicationStatusActions } from '@/components/application-status-actions'

export const dynamic = 'force-dynamic'

interface AppRow {
  id: string
  full_name: string
  email: string
  phone: string | null
  message: string | null
  status: string
  created_at: string
  property: { reference: string | null; title: string } | null
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'new')
    return <Badge className="border-amber-500/25 bg-amber-500/10 text-amber-600">Nouveau</Badge>
  if (status === 'contacted')
    return <Badge className="border-success/25 bg-success/10 text-success">Contacté</Badge>
  return <Badge variant="secondary">Archivé</Badge>
}

export default async function AdminCandidaturesPage() {
  const supabase = await createUserClient()
  const { data } = await supabase
    .from('applications')
    .select(
      'id, full_name, email, phone, message, status, created_at, property:properties(reference, title)',
    )
    .order('created_at', { ascending: false })
  const rows = (data ?? []) as unknown as AppRow[]

  const newCount = rows.filter((r) => r.status === 'new').length

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Candidatures</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} demande{rows.length > 1 ? 's' : ''}
          {newCount > 0 ? ` · ${newCount} nouvelle${newCount > 1 ? 's' : ''}` : ''}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Aucune candidature reçue pour le moment.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <Card key={r.id} className={r.status === 'archived' ? 'opacity-70' : undefined}>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{r.full_name}</span>
                      {r.property?.reference && (
                        <Badge variant="outline">{r.property.reference}</Badge>
                      )}
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <a href={`mailto:${r.email}`} className="flex items-center gap-1 hover:text-foreground">
                        <Mail className="h-3.5 w-3.5" aria-hidden />
                        {r.email}
                      </a>
                      {r.phone && (
                        <a href={`tel:${r.phone}`} className="flex items-center gap-1 hover:text-foreground">
                          <Phone className="h-3.5 w-3.5" aria-hidden />
                          {r.phone}
                        </a>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>

                {r.message && (
                  <p className="whitespace-pre-line rounded-md bg-muted/50 p-3 text-sm leading-relaxed">
                    {r.message}
                  </p>
                )}

                <ApplicationStatusActions id={r.id} status={r.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
