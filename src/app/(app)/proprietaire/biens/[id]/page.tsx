import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin, Wrench, FileText, Download } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PropertyStatusBadge } from '@/components/property-status-badge'

export const dynamic = 'force-dynamic'

const DOCUMENTS_BUCKET = 'documents'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

const TYPE_LABELS: Record<string, string> = {
  apartment: 'Appartement', house: 'Maison', commercial: 'Local commercial', land: 'Terrain', other: 'Autre',
}
const DOC_LABELS: Record<string, string> = {
  lease_contract: 'Contrat de bail', inventory: 'État des lieux', receipt: 'Quittance', report: 'Rapport', other: 'Document',
}

async function getData(id: string) {
  const supabase = await createUserClient()

  const { data: property } = await supabase
    .from('properties')
    .select('id, reference, title, description, address, city, neighborhood, type, surface, rooms, floor, status')
    .eq('id', id)
    .maybeSingle()
  if (!property) return null

  const today = new Date().toISOString().slice(0, 10)

  const { data: lease } = await supabase
    .from('leases')
    .select('id, rent_amount, charges_amount, deposit_amount, start_date, end_date, tenant:profiles(full_name, email)')
    .eq('property_id', id)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const activeLease = lease as unknown as {
    id: string; rent_amount: string; charges_amount: string; deposit_amount: string
    start_date: string; end_date: string | null; tenant: { full_name: string | null; email: string | null } | null
  } | null

  // Loyers du bail actif
  let echeances: { id: string; label: string | null; due_date: string; amount: string; remaining: number; overdue: boolean }[] = []
  let payments: { id: string; amount: string; payment_date: string; status: string }[] = []
  if (activeLease) {
    const { data: chargesRaw } = await supabase
      .from('rent_charges')
      .select('id, label, due_date, amount')
      .eq('lease_id', activeLease.id)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('due_date', { ascending: false })
    const charges = (chargesRaw ?? []) as { id: string; label: string | null; due_date: string; amount: string }[]
    const alloc = new Map<string, number>()
    if (charges.length > 0) {
      const { data: a } = await supabase.from('payment_allocations').select('rent_charge_id, amount').in('rent_charge_id', charges.map((c) => c.id))
      for (const x of a ?? []) alloc.set(x.rent_charge_id, (alloc.get(x.rent_charge_id) ?? 0) + Number(x.amount))
    }
    echeances = charges.map((c) => {
      const remaining = Math.round((Number(c.amount) - (alloc.get(c.id) ?? 0)) * 100) / 100
      return { ...c, remaining, overdue: remaining > 0.005 && c.due_date < today }
    })
    const { data: pays } = await supabase
      .from('payments')
      .select('id, amount, payment_date, status')
      .eq('lease_id', activeLease.id)
      .is('deleted_at', null)
      .order('payment_date', { ascending: false })
      .limit(8)
    payments = (pays ?? []) as typeof payments
  }

  // Signalements
  const { data: issuesRaw } = await supabase
    .from('issues')
    .select('id, title, status, priority, created_at')
    .eq('property_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  const issues = (issuesRaw ?? []) as { id: string; title: string; status: string; priority: string; created_at: string }[]

  // Documents (liés au bien ou à ses baux)
  const { data: leaseIdsRaw } = await supabase.from('leases').select('id').eq('property_id', id)
  const leaseIds = (leaseIdsRaw ?? []).map((l) => l.id)
  const orFilter = leaseIds.length > 0 ? `property_id.eq.${id},lease_id.in.(${leaseIds.join(',')})` : `property_id.eq.${id}`
  const { data: docsRaw } = await supabase
    .from('documents')
    .select('id, type, name, file_url, created_at')
    .or(orFilter)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  const docs = (docsRaw ?? []) as { id: string; type: string | null; name: string | null; file_url: string; created_at: string }[]
  let documents: { id: string; type: string | null; name: string | null; url: string | null }[] = []
  if (docs.length > 0) {
    const { data: signed } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrls(docs.map((d) => d.file_url), 3600)
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
    documents = docs.map((d) => ({ id: d.id, type: d.type, name: d.name, url: byPath.get(d.file_url) ?? null }))
  }

  return { property, activeLease, echeances, payments, issues, documents }
}

export default async function OwnerBienDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()
  const data = await getData(id)
  if (!data) notFound()

  const { property, activeLease, echeances, payments, issues, documents } = data
  const p = property as {
    id: string; reference: string | null; title: string; description: string | null
    address: string | null; city: string | null; neighborhood: string | null
    type: string | null; surface: string | null; rooms: number | null; floor: number | null; status: string
  }
  const overdueTotal = echeances.filter((e) => e.overdue).reduce((s, e) => s + e.remaining, 0)

  return (
    <div className="max-w-4xl space-y-8">
      <Link href="/proprietaire/biens" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Mes biens
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{p.title}</h1>
          {p.reference && <Badge variant="outline">{p.reference}</Badge>}
          <PropertyStatusBadge status={p.status} />
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0" />
          {[p.address, p.neighborhood, p.city].filter(Boolean).join(', ') || '—'}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Colonne latérale : caractéristiques + locataire */}
        <aside className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader className="pb-2"><CardDescription className="stat-label">Caractéristiques</CardDescription></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row k="Type" v={p.type ? TYPE_LABELS[p.type] ?? p.type : '—'} />
              {p.surface && <Row k="Surface" v={`${Number(p.surface)} m²`} />}
              {p.rooms != null && <Row k="Pièces" v={String(p.rooms)} />}
              {p.floor != null && <Row k="Étage" v={p.floor === 0 ? 'RDC' : `${p.floor}ᵉ`} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardDescription className="stat-label">Locataire en cours</CardDescription></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {activeLease ? (
                <>
                  <p className="font-medium">{activeLease.tenant?.full_name ?? '—'}</p>
                  <Row k="Loyer" v={eur(activeLease.rent_amount)} />
                  <Row k="Charges" v={eur(activeLease.charges_amount)} />
                  <Row k="Dépôt" v={eur(activeLease.deposit_amount)} />
                  <Row k="Depuis" v={activeLease.start_date} />
                </>
              ) : (
                <p className="text-muted-foreground">Aucun bail actif — bien vacant.</p>
              )}
            </CardContent>
          </Card>
        </aside>

        {/* Colonne principale */}
        <div className="space-y-8 lg:col-span-2">
          {/* Loyers */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Loyers</h2>
              {overdueTotal > 0.005 && (
                <span className="text-sm font-medium text-destructive">{eur(overdueTotal)} en retard</span>
              )}
            </div>
            {echeances.length === 0 ? (
              <Empty>Aucune échéance.</Empty>
            ) : (
              <Card><CardContent className="divide-y p-0">
                {echeances.slice(0, 6).map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-sm font-medium">{e.label ?? 'Échéance'}</p>
                      <p className="text-xs text-muted-foreground">Échéance au {e.due_date}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn('amount text-sm', e.remaining > 0.005 ? 'text-foreground' : 'text-muted-foreground')}>
                        {e.remaining > 0.005 ? eur(e.remaining) : eur(e.amount)}
                      </span>
                      {e.remaining <= 0.005 ? (
                        <Badge className="border-success/25 bg-success/10 text-success">Soldée</Badge>
                      ) : e.overdue ? (
                        <Badge variant="destructive">En retard</Badge>
                      ) : (
                        <Badge variant="outline">À échoir</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent></Card>
            )}
            {payments.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Derniers paiements : {payments.slice(0, 3).map((pmt) => `${eur(pmt.amount)} (${pmt.payment_date})`).join(' · ')}
              </p>
            )}
          </section>

          {/* Signalements */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display text-lg font-semibold">Signalements</h2>
            </div>
            {issues.length === 0 ? (
              <Empty>Aucun signalement sur ce bien.</Empty>
            ) : (
              <Card><CardContent className="divide-y p-0">
                {issues.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-sm font-medium">{i.title}</p>
                      <p className="text-xs text-muted-foreground">{i.created_at.slice(0, 10)} · priorité {i.priority}</p>
                    </div>
                    <IssueBadge status={i.status} />
                  </div>
                ))}
              </CardContent></Card>
            )}
          </section>

          {/* Documents */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display text-lg font-semibold">Documents</h2>
            </div>
            {documents.length === 0 ? (
              <Empty>Aucun document.</Empty>
            ) : (
              <Card><CardContent className="divide-y p-0">
                {documents.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.name ?? DOC_LABELS[d.type ?? 'other'] ?? 'Document'}</p>
                      <p className="text-xs text-muted-foreground">{DOC_LABELS[d.type ?? 'other'] ?? 'Document'}</p>
                    </div>
                    {d.url ? (
                      <Button variant="outline" size="sm" render={<a href={d.url} target="_blank" rel="noopener noreferrer" />}>
                        <Download className="h-4 w-4" /> Ouvrir
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Indisponible</span>
                    )}
                  </div>
                ))}
              </CardContent></Card>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[10px] border border-dashed py-8 text-center text-sm text-muted-foreground">{children}</div>
}
function IssueBadge({ status }: { status: string }) {
  if (status === 'resolved' || status === 'closed' || status === 'archived')
    return <Badge className="border-success/25 bg-success/10 text-success">Résolu</Badge>
  if (status === 'in_progress') return <Badge variant="secondary">En cours</Badge>
  return <Badge className="border-amber-500/25 bg-amber-500/10 text-amber-600">Ouvert</Badge>
}
