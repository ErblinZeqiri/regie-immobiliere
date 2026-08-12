import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PropertyForm, type OwnerOption } from '@/components/property-form'

export const dynamic = 'force-dynamic'

export default async function NouveauBienPage() {
  const supabase = await createUserClient()
  const { data: owners } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'owner')
    .is('deleted_at', null)
    .order('full_name', { ascending: true })

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/admin/biens"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux biens
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Nouveau bien</CardTitle>
        </CardHeader>
        <CardContent>
          <PropertyForm mode="create" owners={(owners ?? []) as OwnerOption[]} />
        </CardContent>
      </Card>
    </div>
  )
}
