import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GenerateChargesButton } from '@/components/generate-charges-button'

export const dynamic = 'force-dynamic'

const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

interface LeaseRow {
  id: string
  start_date: string
  end_date: string | null
  rent_amount: string
  charges_amount: string
  status: string
  property: { reference: string | null; title: string } | null
  tenant: { full_name: string | null } | null
}

const STATUS: Record<string, { label: string; className?: string; variant?: 'outline' | 'secondary' }> = {
  active: { label: 'Actif', className: 'border-transparent bg-green-600 text-white' },
  ended: { label: 'Terminé', variant: 'secondary' },
  terminated: { label: 'Résilié', variant: 'secondary' },
}

export default async function AdminBauxPage() {
  const supabase = await createUserClient()
  const { data } = await supabase
    .from('leases')
    .select(
      'id, start_date, end_date, rent_amount, charges_amount, status, property:properties(reference, title), tenant:profiles(full_name)',
    )
    .is('deleted_at', null)
    .order('start_date', { ascending: false })
  const rows = (data ?? []) as unknown as LeaseRow[]

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Baux</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length > 1 ? 'baux' : 'bail'}
          </p>
        </div>
        <Button className="gap-2" render={<Link href="/admin/baux/nouveau" />}>
          <Plus className="h-4 w-4" />
          Nouveau bail
        </Button>
      </header>

      {/* Génération groupée des loyers du mois */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Générer les loyers du mois</CardTitle>
        </CardHeader>
        <CardContent>
          <GenerateChargesButton label="Générer pour tous les baux actifs" />
          <p className="mt-2 text-xs text-muted-foreground">
            Crée l’échéance du mois choisi pour chaque bail actif. Sans effet si elle existe déjà.
          </p>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Aucun bail. Créez le premier.
        </div>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Bien</th>
                  <th className="p-3 font-medium">Locataire</th>
                  <th className="p-3 font-medium">Loyer</th>
                  <th className="p-3 font-medium">Début</th>
                  <th className="p-3 font-medium">Statut</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const s = STATUS[r.status] ?? { label: r.status, variant: 'outline' as const }
                  const total = Number(r.rent_amount) + Number(r.charges_amount)
                  return (
                    <tr key={r.id} className="hover:bg-muted/40">
                      <td className="p-3 font-medium">
                        {r.property?.reference ?? r.property?.title ?? '—'}
                      </td>
                      <td className="p-3 text-muted-foreground">{r.tenant?.full_name ?? '—'}</td>
                      <td className="p-3">
                        <span className="amount">{eur(total)}</span>
                        <span className="text-xs text-muted-foreground"> /mois</span>
                      </td>
                      <td className="p-3 text-muted-foreground">{r.start_date}</td>
                      <td className="p-3">
                        <Badge variant={s.variant} className={s.className}>
                          {s.label}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <Button variant="outline" size="sm" render={<Link href={`/admin/baux/${r.id}`} />}>
                          Voir
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
