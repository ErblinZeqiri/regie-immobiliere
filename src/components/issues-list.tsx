import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { IssueStatusControl } from '@/components/issue-status-control'

interface IssueRow {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  created_at: string
  property: { reference: string | null; title: string } | null
  creator: { full_name: string | null } | null
}

const ISSUE_PHOTOS_BUCKET = 'issue-photos'

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'open':
      return <Badge variant="outline" className="border-amber-500 text-amber-600">Ouvert</Badge>
    case 'in_progress':
      return <Badge className="border-blue-500/25 bg-blue-500/10 text-blue-600">En cours</Badge>
    case 'resolved':
      return <Badge className="border-success/25 bg-success/10 text-success">Résolu</Badge>
    case 'closed':
      return <Badge variant="secondary">Clôturé</Badge>
    default:
      return <Badge variant="secondary" className="opacity-80">Archivé</Badge>
  }
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; className: string }> = {
    low: { label: 'Basse', className: 'border-transparent bg-muted text-muted-foreground' },
    medium: { label: 'Moyenne', className: 'border-transparent bg-muted text-muted-foreground' },
    high: { label: 'Haute', className: 'border-amber-500 text-amber-600' },
    urgent: { label: 'Urgente', className: 'border-transparent bg-destructive/10 text-destructive' },
  }
  const p = map[priority] ?? map.medium
  return <Badge variant="outline" className={p.className}>Priorité {p.label.toLowerCase()}</Badge>
}

export async function IssuesList({ canManage = false }: { canManage?: boolean }) {
  const supabase = await createUserClient()

  // RLS : admin voit tout ; locataire/propriétaire voient les signalements de
  // leurs biens. La même requête sert donc les trois rôles.
  const { data } = await supabase
    .from('issues')
    .select(
      'id, title, description, status, priority, created_at, property:properties(reference, title), creator:profiles(full_name)',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  const rows = (data ?? []) as unknown as IssueRow[]

  // Photos (URLs signées) regroupées par signalement
  const photosByIssue = new Map<string, string[]>()
  const ids = rows.map((r) => r.id)
  if (ids.length > 0) {
    const { data: photos } = await supabase
      .from('issue_photos')
      .select('issue_id, file_url')
      .in('issue_id', ids)
    const allPaths = (photos ?? []).map((p) => p.file_url)
    const urlByPath = new Map<string, string>()
    if (allPaths.length > 0) {
      const { data: signed } = await supabase.storage
        .from(ISSUE_PHOTOS_BUCKET)
        .createSignedUrls(allPaths, 60 * 60)
      ;(signed ?? []).forEach((s, i) => {
        if (s.signedUrl) urlByPath.set(allPaths[i], s.signedUrl)
      })
    }
    for (const p of photos ?? []) {
      const url = urlByPath.get(p.file_url)
      if (!url) continue
      const arr = photosByIssue.get(p.issue_id) ?? []
      arr.push(url)
      photosByIssue.set(p.issue_id, arr)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        Aucun signalement.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {rows.map((r) => {
        const photos = photosByIssue.get(r.id) ?? []
        return (
          <Card key={r.id}>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.title}</span>
                    {r.property?.reference && <Badge variant="outline">{r.property.reference}</Badge>}
                    <StatusBadge status={r.status} />
                    <PriorityBadge priority={r.priority} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.creator?.full_name ?? '—'} · {new Date(r.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                {canManage && <IssueStatusControl id={r.id} status={r.status} />}
              </div>

              {r.description && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {r.description}
                </p>
              )}

              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {photos.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt=""
                      className="h-20 w-20 rounded-md object-cover ring-1 ring-foreground/10"
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
