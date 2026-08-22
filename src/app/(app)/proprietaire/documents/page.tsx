import Link from 'next/link'
import { FileText, Download } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'
const DOCUMENTS_BUCKET = 'documents'

const DOC_LABELS: Record<string, string> = {
  lease_contract: 'Contrat de bail', inventory: 'État des lieux', receipt: 'Quittance', report: 'Rapport', other: 'Document',
}

interface DocRow {
  id: string
  type: string | null
  name: string | null
  file_url: string
  created_at: string
  property: { id: string; reference: string | null; title: string } | null
  lease: { property: { id: string; reference: string | null; title: string } | null } | null
}

async function getData(bien?: string) {
  const supabase = await createUserClient()

  const { data: propsRaw } = await supabase
    .from('properties')
    .select('id, reference, title')
    .is('deleted_at', null)
    .order('reference', { ascending: true })
  const properties = (propsRaw ?? []) as { id: string; reference: string | null; title: string }[]

  const { data: docsRaw } = await supabase
    .from('documents')
    .select('id, type, name, file_url, created_at, property:properties(id, reference, title), lease:leases(property:properties(id, reference, title))')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  let docs = (docsRaw ?? []) as unknown as DocRow[]

  const propOf = (d: DocRow) => d.property ?? d.lease?.property ?? null
  if (bien) docs = docs.filter((d) => propOf(d)?.id === bien)

  let documents: { id: string; type: string | null; name: string | null; created_at: string; prop: string; url: string | null }[] = []
  if (docs.length > 0) {
    const { data: signed } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrls(docs.map((d) => d.file_url), 3600)
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
    documents = docs.map((d) => {
      const pr = propOf(d)
      return {
        id: d.id,
        type: d.type,
        name: d.name,
        created_at: d.created_at,
        prop: pr?.reference ?? pr?.title ?? '—',
        url: byPath.get(d.file_url) ?? null,
      }
    })
  }

  return { properties, documents }
}

export default async function OwnerDocumentsPage({ searchParams }: { searchParams: Promise<{ bien?: string }> }) {
  const { bien } = await searchParams
  const { properties, documents } = await getData(bien)

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contrats, quittances et pièces liées à vos biens et à vos baux.
        </p>
      </header>

      {properties.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Chip href="/proprietaire/documents" active={!bien}>Tous</Chip>
          {properties.map((p) => (
            <Chip key={p.id} href={`/proprietaire/documents?bien=${p.id}`} active={bien === p.id}>
              {p.reference ?? p.title}
            </Chip>
          ))}
        </div>
      )}

      {documents.length === 0 ? (
        <div className="rounded-[10px] border border-dashed py-16 text-center text-sm text-muted-foreground">
          Aucun document disponible pour le moment.
        </div>
      ) : (
        <Card><CardContent className="divide-y p-0">
          {documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent">
                  <FileText className="h-4 w-4 text-primary" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.name ?? DOC_LABELS[d.type ?? 'other'] ?? 'Document'}</p>
                  <p className="text-xs text-muted-foreground">
                    {DOC_LABELS[d.type ?? 'other'] ?? 'Document'} · {d.created_at.slice(0, 10)}
                    <Badge variant="outline" className="ml-2">{d.prop}</Badge>
                  </p>
                </div>
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
    </div>
  )
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent',
      )}
    >
      {children}
    </Link>
  )
}
