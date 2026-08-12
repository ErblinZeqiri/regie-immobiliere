import Link from 'next/link'
import { Building2, Wrench, FileText, Receipt } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

interface PropertyRow {
  id: string
  reference: string | null
  title: string
  address: string | null
  city: string | null
  status: string
}
interface IssueRow {
  id: string
  title: string
  status: string
  priority: string
  created_at: string
  property: { reference: string | null; title: string } | null
}

async function getOwnerData() {
  const supabase = await createUserClient()

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const monthStart = `${now.toISOString().slice(0, 7)}-01`
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toISOString()
    .slice(0, 10)

  // --- Mes biens (RLS = uniquement les biens possédés) ---------------------
  const { data: propsRaw } = await supabase
    .from('properties')
    .select('id, reference, title, address, city, status')
    .is('deleted_at', null)
    .order('reference', { ascending: true })
  const properties = (propsRaw ?? []) as PropertyRow[]

  // --- Encaissé ce mois : paiements validés du mois courant ----------------
  const { data: paidThisMonth } = await supabase
    .from('payments')
    .select('amount')
    .eq('status', 'validated')
    .gte('payment_date', monthStart)
    .lt('payment_date', nextMonthStart)
    .is('deleted_at', null)
  const collectedThisMonth = (paidThisMonth ?? []).reduce((s, p) => s + Number(p.amount), 0)

  // --- Paiements en attente de validation ----------------------------------
  const { count: pendingCount } = await supabase
    .from('payments')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .is('deleted_at', null)

  // --- Total en retard : échéances actives, échues, non soldées ------------
  const { data: dueCharges } = await supabase
    .from('rent_charges')
    .select('id, amount')
    .eq('status', 'active')
    .lt('due_date', today)
    .is('deleted_at', null)

  const chargeIds = (dueCharges ?? []).map((c) => c.id)
  const allocByCharge = new Map<string, number>()
  if (chargeIds.length > 0) {
    const { data: allocs } = await supabase
      .from('payment_allocations')
      .select('rent_charge_id, amount')
      .in('rent_charge_id', chargeIds)
    for (const a of allocs ?? []) {
      allocByCharge.set(
        a.rent_charge_id,
        (allocByCharge.get(a.rent_charge_id) ?? 0) + Number(a.amount),
      )
    }
  }
  const overdueTotal = (dueCharges ?? []).reduce((s, c) => {
    const remaining = Number(c.amount) - (allocByCharge.get(c.id) ?? 0)
    return remaining > 0.005 ? s + remaining : s
  }, 0)

  // --- Signalements ouverts sur mes biens ----------------------------------
  const { data: issuesRaw } = await supabase
    .from('issues')
    .select('id, title, status, priority, created_at, property:properties(reference, title)')
    .in('status', ['open', 'in_progress'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  const issues = (issuesRaw ?? []) as unknown as IssueRow[]

  const rented = properties.filter((p) => p.status === 'rented').length
  const vacant = properties.filter((p) => p.status === 'available').length

  return {
    properties,
    rented,
    vacant,
    collectedThisMonth,
    pendingCount: pendingCount ?? 0,
    overdueTotal,
    issues,
  }
}

function PropertyStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'rented':
      return <Badge className="border-transparent bg-green-600 text-white">Loué</Badge>
    case 'available':
      return (
        <Badge variant="outline" className="border-amber-500 text-amber-600">
          Vacant
        </Badge>
      )
    case 'maintenance':
      return <Badge variant="secondary">Entretien</Badge>
    case 'sold':
      return <Badge variant="secondary">Vendu</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default async function ProprietaireDashboardPage() {
  const { properties, rented, vacant, collectedThisMonth, pendingCount, overdueTotal, issues } =
    await getOwnerData()

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">
          {properties.length} bien{properties.length > 1 ? 's' : ''} · {rented} loué
          {rented > 1 ? 's' : ''} · {vacant} vacant{vacant > 1 ? 's' : ''}
        </p>
      </header>

      {/* Résumé financier */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Encaissé ce mois</CardDescription>
            <CardTitle className="text-3xl text-green-600">{eur(collectedThisMonth)}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">Paiements validés du mois en cours.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total en retard</CardDescription>
            <CardTitle
              className={`text-3xl ${overdueTotal > 0.005 ? 'text-destructive' : 'text-green-600'}`}
            >
              {eur(overdueTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              {overdueTotal > 0.005 ? 'Échéances échues non soldées.' : 'Tous les loyers sont à jour.'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Paiements en attente</CardDescription>
            <CardTitle className={`text-3xl ${pendingCount > 0 ? 'text-amber-600' : ''}`}>
              {pendingCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              {pendingCount > 0 ? 'En cours de validation par la régie.' : 'Rien en attente.'}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Mes biens */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">Mes biens</h2>
        </div>

        {properties.length === 0 ? (
          <EmptyState message="Aucun bien enregistré pour le moment." />
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {properties.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.title}</span>
                      {p.reference && <Badge variant="outline">{p.reference}</Badge>}
                      <PropertyStatusBadge status={p.status} />
                    </div>
                    {(p.address || p.city) && (
                      <p className="text-sm text-muted-foreground">
                        {[p.address, p.city].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Accès rapides par bien */}
                  <div className="flex items-center gap-3 text-sm">
                    <Link
                      href={`/proprietaire/loyers?bien=${p.id}`}
                      className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <Receipt className="h-4 w-4" aria-hidden />
                      Loyers
                    </Link>
                    <Link
                      href={`/proprietaire/documents?bien=${p.id}`}
                      className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <FileText className="h-4 w-4" aria-hidden />
                      Documents
                    </Link>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Signalements ouverts */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Wrench className="h-5 w-5 text-muted-foreground" aria-hidden />
          <h2 className="text-lg font-semibold">Signalements ouverts</h2>
        </div>

        {issues.length === 0 ? (
          <EmptyState message="Aucun signalement en cours. Tout est en ordre. ✅" />
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {issues.map((i) => (
                <div key={i.id} className="flex items-center justify-between p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{i.title}</span>
                      {i.property?.reference && (
                        <Badge variant="outline">{i.property.reference}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {i.status === 'in_progress' ? 'En cours de traitement' : 'Ouvert'} · priorité{' '}
                      {i.priority}
                    </p>
                  </div>
                  <Badge
                    variant={i.status === 'in_progress' ? 'secondary' : 'outline'}
                    className={i.status === 'open' ? 'border-amber-500 text-amber-600' : ''}
                  >
                    {i.status === 'in_progress' ? 'En cours' : 'Ouvert'}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}
