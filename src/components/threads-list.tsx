import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface ThreadRow {
  id: string
  subject: string | null
  status: string
  created_at: string
  property: { reference: string | null } | null
  messages: { content: string; created_at: string }[]
}

export async function ThreadsList({ basePath }: { basePath: string }) {
  const supabase = await createUserClient()
  const { data } = await supabase
    .from('message_threads')
    .select('id, subject, status, created_at, property:properties(reference), messages(content, created_at)')
    .order('created_at', { ascending: false })
  const rows = (data ?? []) as unknown as ThreadRow[]

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        Aucune conversation.
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="divide-y p-0">
        {rows.map((t) => {
          const last = [...t.messages].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
          return (
            <Link
              key={t.id}
              href={`${basePath}/${t.id}`}
              className="flex items-start gap-3 p-4 transition-colors hover:bg-muted/40"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MessageSquare className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{t.subject ?? 'Conversation'}</span>
                  {t.property?.reference && <Badge variant="outline">{t.property.reference}</Badge>}
                  {t.status !== 'open' && (
                    <Badge variant="secondary">{t.status === 'archived' ? 'Archivée' : 'Clôturée'}</Badge>
                  )}
                </div>
                <p className="line-clamp-1 text-sm text-muted-foreground">
                  {last?.content ?? 'Aucun message'}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date((last?.created_at ?? t.created_at)).toLocaleDateString('fr-FR')}
              </span>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}
