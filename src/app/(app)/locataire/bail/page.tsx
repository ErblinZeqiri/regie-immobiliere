import Link from 'next/link'
import { Home, FileText, MapPin, MessageSquare, Download } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

const DOCUMENTS_BUCKET = 'documents'
const SIGNED_TTL = 60 * 60

const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

const TYPE_LABELS: Record<string, string> = {
  lease_contract: 'Contrat de bail',
  inventory: 'État des lieux',
  report: 'Rapport',
  other: 'Document',
}

interface LeaseRow {
  id: string
  start_date: string
  end_date: string | null
  status: string
  rent_amount: string
  charges_amount: string
  deposit_amount: string
  property: {
    reference: string | null
    title: string
    address: string | null
    city: string | null
    neighborhood: string | null
    type: string | null
    surface: string | null
    rooms: number | null
    floor: number | null
  } | null
}

interface DocItem {
  id: string
  type: string | null
  name: string | null
  created_at: string
  url: string | null
}

async function getBail() {
  const supabase = await createUserClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: leaseRaw } = await supabase
    .from('leases')
    .select(
      'id, start_date, end_date, status, rent_amount, charges_amount, deposit_amount, property:properties(reference, title, address, city, neighborhood, type, surface, rooms, floor)',
    )
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lease = leaseRaw as unknown as LeaseRow | null
  if (!lease) return { lease: null, documents: [] as DocItem[] }

  // Documents du bail (hors quittances, qui vivent dans « Paiements »).
  const { data: docsRaw } = await supabase
    .from('documents')
    .select('id, type, name, file_url, created_at')
    .eq('lease_id', lease.id)
    .neq('type', 'receipt')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  const docs = (docsRaw ?? []) as { id: string; type: string | null; name: string | null; file_url: string; created_at: string }[]

  let documents: DocItem[] = []
  if (docs.length > 0) {
    const { data: signed } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrls(docs.map((d) => d.file_url), SIGNED_TTL)
    const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
    documents = docs.map((d) => ({
      id: d.id,
      type: d.type,
      name: d.name,
      created_at: d.created_at,
      url: urlByPath.get(d.file_url) ?? null,
    }))
  }

  return { lease, documents }
}

function Row({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={strong ? 'amount text-base' : 'text-sm font-medium'}>{value}</dd>
    </div>
  )
}

export default async function MonBailPage() {
  const data = await getBail()

  if (!data || !data.lease) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Mon bail</h1>
        <div className="rounded-[10px] border border-dashed py-16 text-center text-sm text-muted-foreground">
          Aucun bail actif associé à votre compte. Contactez la régie.
        </div>
      </div>
    )
  }

  const { lease, documents } = data
  const prop = lease.property
  const monthly = Number(lease.rent_amount) + Number(lease.charges_amount)
  const location = [prop?.neighborhood, prop?.city].filter(Boolean).join(', ')

  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Mon bail</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Le détail de votre location et vos documents contractuels.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Logement */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardDescription className="stat-label">Logement</CardDescription>
            </div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              {prop?.title ?? 'Logement'}
              {prop?.reference && <Badge variant="outline">{prop.reference}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {location && (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {[prop?.address, location].filter(Boolean).join(' — ')}
              </p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              {prop?.surface && <span>{Number(prop.surface)} m²</span>}
              {prop?.rooms != null && <span>· {prop.rooms} pièces</span>}
              {prop?.floor != null && (
                <span>· {prop.floor === 0 ? 'RDC' : `${prop.floor}ᵉ étage`}</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Conditions financières */}
        <Card>
          <CardHeader className="pb-1">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardDescription className="stat-label">Conditions du bail</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Row label="Loyer" value={eur(lease.rent_amount)} />
              <Row label="Charges" value={eur(lease.charges_amount)} />
              <Row label="Total mensuel" value={eur(monthly)} strong />
              <Row label="Dépôt de garantie" value={eur(lease.deposit_amount)} />
              <Row label="Début du bail" value={lease.start_date} />
              <Row label="Fin du bail" value={lease.end_date ?? 'Indéterminée'} />
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Documents */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Documents</h2>
        {documents.length === 0 ? (
          <div className="rounded-[10px] border border-dashed py-10 text-center text-sm text-muted-foreground">
            Aucun document disponible pour le moment.
          </div>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent">
                      <FileText className="h-4 w-4 text-primary" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {d.name ?? TYPE_LABELS[d.type ?? 'other'] ?? 'Document'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {TYPE_LABELS[d.type ?? 'other'] ?? 'Document'} · {d.created_at.slice(0, 10)}
                      </p>
                    </div>
                  </div>
                  {d.url ? (
                    <Button
                      variant="outline"
                      size="sm"
                      render={<a href={d.url} target="_blank" rel="noopener noreferrer" />}
                    >
                      <Download className="h-4 w-4" />
                      Ouvrir
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Indisponible</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* Contact régie */}
      <Card>
        <CardContent className="flex flex-col items-start justify-between gap-3 py-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent">
              <MessageSquare className="h-4 w-4 text-primary" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">Une question sur votre bail ?</p>
              <p className="text-xs text-muted-foreground">La régie vous répond directement.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" render={<Link href="/locataire/messages" />}>
            Contacter la régie
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
