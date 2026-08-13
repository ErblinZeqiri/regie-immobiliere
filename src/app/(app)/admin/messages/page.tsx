import { ThreadsList } from '@/components/threads-list'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">Conversations avec les propriétaires et locataires.</p>
      </header>
      <ThreadsList basePath="/admin/messages" />
    </div>
  )
}
