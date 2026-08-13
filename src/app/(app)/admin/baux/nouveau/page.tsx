import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LeaseForm } from '@/components/lease-form'
import type { SelectOption } from '@/components/simple-select'

export const dynamic = 'force-dynamic'

const STATUS_HINT: Record<string, string> = {
  rented: ' — loué',
  maintenance: ' — entretien',
  sold: ' — vendu',
}

export default async function NouveauBailPage() {
  const supabase = await createUserClient()

  const [{ data: props }, { data: tenants }] = await Promise.all([
    supabase
      .from('properties')
      .select('id, reference, title, status')
      .is('deleted_at', null)
      .order('reference', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'tenant')
      .is('deleted_at', null)
      .order('full_name', { ascending: true }),
  ])

  const propertyOptions: SelectOption[] = (props ?? []).map((p) => ({
    value: p.id,
    label: `${p.reference ?? p.title}${STATUS_HINT[p.status] ?? ''}`,
  }))
  const tenantOptions: SelectOption[] = (tenants ?? []).map((t) => ({
    value: t.id,
    label: t.full_name ?? t.id.slice(0, 8),
  }))

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/admin/baux"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux baux
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Nouveau bail</CardTitle>
        </CardHeader>
        <CardContent>
          {tenantOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun locataire enregistré. Créez d’abord un compte locataire dans{' '}
              <Link href="/admin/locataires/nouveau" className="text-primary hover:underline">
                Locataires
              </Link>
              .
            </p>
          ) : (
            <LeaseForm properties={propertyOptions} tenants={tenantOptions} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
