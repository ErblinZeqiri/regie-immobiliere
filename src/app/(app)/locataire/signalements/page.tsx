import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IssueForm } from '@/components/issue-form'
import { IssuesList } from '@/components/issues-list'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const supabase = await createUserClient()
  // RLS : ne renvoie que le bail du locataire connecté
  const { data: lease } = await supabase
    .from('leases')
    .select('id, property_id')
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Signalements</h1>
        <p className="text-sm text-muted-foreground">Signalez un problème dans votre logement.</p>
      </header>

      {lease ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Nouveau signalement</CardTitle>
          </CardHeader>
          <CardContent>
            <IssueForm propertyId={lease.property_id} leaseId={lease.id} />
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          Aucun bail actif associé à votre compte.
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Mes signalements</h2>
        <IssuesList />
      </section>
    </div>
  )
}
