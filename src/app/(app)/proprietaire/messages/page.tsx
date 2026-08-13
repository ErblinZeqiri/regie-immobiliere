import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NewThreadForm } from '@/components/new-thread-form'
import { ThreadsList } from '@/components/threads-list'
import type { SelectOption } from '@/components/simple-select'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const supabase = await createUserClient()
  // RLS : uniquement les biens du propriétaire connecté
  const { data: props } = await supabase
    .from('properties')
    .select('id, reference, title')
    .is('deleted_at', null)
    .order('reference', { ascending: true })

  const propertyOptions: SelectOption[] = (props ?? []).map((p) => ({
    value: p.id,
    label: p.reference ?? p.title,
  }))

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground">Échangez avec la régie.</p>
      </header>

      {propertyOptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nouvelle conversation</CardTitle>
          </CardHeader>
          <CardContent>
            <NewThreadForm basePath="/proprietaire/messages" properties={propertyOptions} />
          </CardContent>
        </Card>
      )}

      <ThreadsList basePath="/proprietaire/messages" />
    </div>
  )
}
