import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NewThreadForm } from '@/components/new-thread-form'
import { ThreadsList } from '@/components/threads-list'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const supabase = await createUserClient()
  const { data: lease } = await supabase
    .from('leases')
    .select('id')
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">Échangez avec la régie.</p>
      </header>

      {lease && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nouvelle conversation</CardTitle>
          </CardHeader>
          <CardContent>
            <NewThreadForm basePath="/locataire/messages" leaseId={lease.id} />
          </CardContent>
        </Card>
      )}

      <ThreadsList basePath="/locataire/messages" />
    </div>
  )
}
