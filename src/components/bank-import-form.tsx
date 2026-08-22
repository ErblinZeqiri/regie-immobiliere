'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SimpleSelect } from '@/components/simple-select'
import { importBankStatement } from '@/actions/reconciliation'

/* ----------------------------- Parsing utils ----------------------------- */
function detectDelim(line: string) {
  return (line.match(/;/g)?.length ?? 0) >= (line.match(/,/g)?.length ?? 0) ? ';' : ','
}
function parseCSV(text: string): string[][] {
  const first = text.slice(0, text.indexOf('\n') >= 0 ? text.indexOf('\n') : text.length)
  const delim = detectDelim(first)
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false
      } else field += c
    } else if (c === '"') inQ = true
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim().length))
}
function parseAmount(s: string): number {
  let t = (s ?? '').replace(/[^\d.,-]/g, '').trim()
  if (!t) return NaN
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.')
  t = lc > ld ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  return parseFloat(t)
}
function parseDate(s: string): string {
  const t = (s ?? '').trim()
  let m: RegExpMatchArray | null
  if ((m = t.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`
  if ((m = t.match(/^(\d{2})[/.](\d{2})[/.](\d{4})/))) return `${m[3]}-${m[2]}-${m[1]}`
  return ''
}

const eur = (v: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)

export function BankImportForm() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [filename, setFilename] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [hasHeader, setHasHeader] = useState(true)
  const [map, setMap] = useState({ date: '', amount: '', label: '' })
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ total: number; validated: number; exceptions: number } | null>(null)
  const [pending, startTransition] = useTransition()

  function onFile(file: File) {
    setError(null)
    setResult(null)
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseCSV(String(reader.result ?? ''))
      if (rows.length === 0) { setError('Fichier vide ou illisible.'); return }
      setFilename(file.name)
      const cols = rows[0].map((_, i) => `Colonne ${i + 1}`)
      setHeaders(hasHeader ? rows[0].map((h) => h.trim() || `Colonne ${cols.indexOf(h) + 1}`) : cols)
      setDataRows(hasHeader ? rows.slice(1) : rows)
      // auto-mapping heuristique
      const guess = (keys: string[]) =>
        String(rows[0].findIndex((h) => keys.some((k) => h.toLowerCase().includes(k))))
      setMap({
        date: hasHeader ? guess(['date']) : '0',
        amount: hasHeader ? guess(['montant', 'amount', 'crédit', 'credit', 'valeur']) : '1',
        label: hasHeader ? guess(['libell', 'label', 'motif', 'communication', 'description', 'référence', 'reference']) : '2',
      })
    }
    reader.readAsText(file, 'utf-8')
  }

  const options = useMemo(
    () => headers.map((h, i) => ({ value: String(i), label: h })),
    [headers],
  )

  const preview = useMemo(() => {
    if (!map.date || !map.amount || !map.label) return []
    const di = Number(map.date), ai = Number(map.amount), li = Number(map.label)
    return dataRows.slice(0, 5).map((r) => ({
      date: parseDate(r[di] ?? ''),
      amount: parseAmount(r[ai] ?? ''),
      label: (r[li] ?? '').trim(),
    }))
  }, [dataRows, map])

  const ready = map.date && map.amount && map.label && dataRows.length > 0 &&
    Number(map.date) >= 0 && Number(map.amount) >= 0 && Number(map.label) >= 0

  function submit() {
    setError(null)
    const di = Number(map.date), ai = Number(map.amount), li = Number(map.label)
    const rows = dataRows
      .map((r) => ({ date: parseDate(r[di] ?? ''), amount: parseAmount(r[ai] ?? ''), label: (r[li] ?? '').trim() }))
      .filter((r) => r.date && !Number.isNaN(r.amount) && r.label)
    if (rows.length === 0) { setError('Aucune ligne exploitable après mapping. Vérifiez les colonnes.'); return }
    startTransition(async () => {
      const res = await importBankStatement({ filename, rows })
      if (!res.ok) { setError(res.error); return }
      setResult(res.data)
      setHeaders([]); setDataRows([]); setFilename('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Zone d'upload */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-[10px] border border-dashed border-border bg-muted/30 px-6 py-8 text-center transition-colors hover:border-primary/40 hover:bg-accent/40"
      >
        <FileSpreadsheet className="mb-2 h-7 w-7 text-muted-foreground" />
        <p className="text-sm font-medium">{filename || 'Déposez un relevé CSV ou cliquez pour choisir'}</p>
        <p className="mt-1 text-xs text-muted-foreground">Colonnes attendues : date, montant, libellé</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
        />
      </div>

      {result && (
        <div className="rounded-[10px] border border-success/25 bg-success/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-success">
            <CheckCircle2 className="h-4 w-4" /> Import terminé
          </p>
          <p className="mt-1 text-muted-foreground">
            {result.total} ligne{result.total > 1 ? 's' : ''} · {result.validated} validée
            {result.validated > 1 ? 's' : ''} automatiquement · {result.exceptions} exception
            {result.exceptions > 1 ? 's' : ''} à traiter.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-[10px] border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Mapping + aperçu */}
      {headers.length > 0 && (
        <div className="space-y-4 rounded-[10px] border border-border p-4">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
            La première ligne est un en-tête
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Colonne date">
              <SimpleSelect value={map.date} onValueChange={(v) => setMap((m) => ({ ...m, date: v }))} options={options} placeholder="—" />
            </Field>
            <Field label="Colonne montant">
              <SimpleSelect value={map.amount} onValueChange={(v) => setMap((m) => ({ ...m, amount: v }))} options={options} placeholder="—" />
            </Field>
            <Field label="Colonne libellé / référence">
              <SimpleSelect value={map.label} onValueChange={(v) => setMap((m) => ({ ...m, label: v }))} options={options} placeholder="—" />
            </Field>
          </div>

          {preview.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Montant</th>
                    <th className="py-2 font-medium">Libellé</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-4">{r.date || <span className="text-destructive">?</span>}</td>
                      <td className="py-2 pr-4 tabular-nums">{Number.isNaN(r.amount) ? <span className="text-destructive">?</span> : eur(r.amount)}</td>
                      <td className="py-2 text-muted-foreground">{r.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                Aperçu des 5 premières lignes sur {dataRows.length}.
              </p>
            </div>
          )}

          <Button onClick={submit} disabled={!ready || pending}>
            <Upload className="h-4 w-4" />
            {pending ? 'Import en cours…' : `Importer et rapprocher (${dataRows.length})`}
          </Button>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
