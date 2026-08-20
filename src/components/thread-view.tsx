import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Lock } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MessageReplyForm } from '@/components/message-reply-form'
import { ThreadStatusControl } from '@/components/thread-status-control'

function ThreadStatusBadge({ status }: { status: string }) {
  if (status === 'closed') return <Badge variant="secondary">Clôturée</Badge>
  if (status === 'archived') return <Badge variant="secondary" className="opacity-80">Archivée</Badge>
  return <Badge className="border-success/25 bg-success/10 text-success">Ouverte</Badge>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface MessageRow {
  id: string
  content: string
  created_at: string
  sender_id: string
  sender: { full_name: string | null } | null
}

export async function ThreadView({
  id,
  basePath,
  canManage = false,
}: {
  id: string
  basePath: string
  canManage?: boolean
}) {
  if (!UUID_RE.test(id)) notFound()
  const supabase = await createUserClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // RLS : un non-participant reçoit null -> 404
  const { data: thread } = await supabase
    .from('message_threads')
    .select('id, subject, status, property:properties(reference)')
    .eq('id', id)
    .maybeSingle()
  if (!thread) notFound()

  const { data: messages } = await supabase
    .from('messages')
    .select('id, content, created_at, sender_id, sender:profiles(full_name)')
    .eq('thread_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  const rows = (messages ?? []) as unknown as MessageRow[]

  const property = (thread as unknown as { property: { reference: string | null } | null }).property
  const status = (thread as { status: string }).status

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link
        href={basePath}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux messages
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight">
            {(thread as { subject: string | null }).subject ?? 'Conversation'}
          </h1>
          {property?.reference && <Badge variant="outline">{property.reference}</Badge>}
          <ThreadStatusBadge status={status} />
        </div>
        {canManage && <ThreadStatusControl threadId={id} status={status} />}
      </div>

      <Card>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aucun message.</p>
          ) : (
            rows.map((m) => {
              const mine = m.sender_id === user?.id
              return (
                <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[80%] space-y-1', mine && 'items-end text-right')}>
                    <div
                      className={cn(
                        'rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                        mine
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground',
                      )}
                    >
                      <p className="whitespace-pre-line">{m.content}</p>
                    </div>
                    <p className="px-1 text-[11px] text-muted-foreground">
                      {mine ? 'Vous' : (m.sender?.full_name ?? 'Régie')} ·{' '}
                      {new Date(m.created_at).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {status === 'open' ? (
        <MessageReplyForm threadId={id} />
      ) : (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" aria-hidden />
          Conversation {status === 'archived' ? 'archivée' : 'clôturée'} — lecture seule.
        </div>
      )}
    </div>
  )
}
