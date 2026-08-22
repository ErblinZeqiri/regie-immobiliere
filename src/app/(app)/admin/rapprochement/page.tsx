import { createUserClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BankImportForm } from '@/components/bank-import-form'
import {
  BankExceptionsList,
  type ExceptionRow,
  type ChargeOption,
} from '@/components/bank-exceptions-list'

export const dynamic = 'force-dynamic'

const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

interface ChargeJoin {
  id: string
  amount: string
  payment_ref: string | null
  lease: {
    tenant: { full_name: string | null } | null
    property: { reference: string | null } | null
  } | null
}

async function getData() {
  const supabase = await createUserClient()

  const [{ data: importsRaw }, { data: exceptionsRaw }, { data: chargesRaw }] = await Promise.all([
    supabase
      .from('bank_imports')
      .select('id, filename, row_count, validated_count, exception_count, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('bank_transactions')
      .select('id, tx_date, amount, label, note, matched_charge_id')
      .eq('status', 'exception')
      .order('created_at', { ascending: false }),
    supabase
      .from('rent_charges')
      .select('id, amount, payment_ref, lease:leases(tenant:profiles(full_name), property:properties(reference))')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('payment_ref', 'is', null),
  ])

  const charges = (chargesRaw ?? []) as unknown as ChargeJoin[]
  const allocByCharge = new Map<string, number>()
  if (charges.length > 0) {
    const { data: allocs } = await supabase
      .from('payment_allocations')
      .select('rent_charge_id, amount')
      .in('rent_charge_id', charges.map((c) => c.id))
    for (const a of allocs ?? [])
      allocByCharge.set(a.rent_charge_id, (allocByCharge.get(a.rent_charge_id) ?? 0) + Number(a.amount))
  }

  const openCharges: ChargeOption[] = charges
    .map((c) => {
      const remaining = Math.round((Number(c.amount) - (allocByCharge.get(c.id) ?? 0)) * 100) / 100
      return { c, remaining }
    })
    .filter((x) => x.remaining > 0.005)
    .map(({ c, remaining }) => ({
      value: c.id,
      label: `${c.payment_ref ?? '—'} · ${eur(remaining)} · ${c.lease?.tenant?.full_name ?? '—'}`,
    }))

  return {
    imports: importsRaw ?? [],
    exceptions: (exceptionsRaw ?? []) as ExceptionRow[],
    openCharges,
  }
}

export default async function RapprochementPage() {
  const { imports, exceptions, openCharges } = await getData()

  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Rapprochement bancaire</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Importez un relevé : les virements dont la référence et le montant correspondent sont
          validés automatiquement.
        </p>
      </header>

      {/* Import */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Importer un relevé</CardTitle>
          <CardDescription className="stat-label">Fichier CSV — mapping des colonnes puis rapprochement.</CardDescription>
        </CardHeader>
        <CardContent>
          <BankImportForm />
        </CardContent>
      </Card>

      {/* Exceptions */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold">Exceptions à traiter</h2>
          {exceptions.length > 0 && (
            <span className="rounded bg-amber-500/10 px-1.5 text-[11px] font-medium tabular-nums text-amber-600">
              {exceptions.length}
            </span>
          )}
        </div>
        <BankExceptionsList exceptions={exceptions} openCharges={openCharges} />
      </section>

      {/* Historique des imports */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Imports récents</h2>
        {imports.length === 0 ? (
          <div className="rounded-[10px] border border-dashed py-10 text-center text-sm text-muted-foreground">
            Aucun import pour le moment.
          </div>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {imports.map((imp) => (
                <div key={imp.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{imp.filename ?? 'Relevé'}</p>
                    <p className="text-xs text-muted-foreground">
                      {imp.created_at.slice(0, 16).replace('T', ' ')} · {imp.row_count} ligne
                      {imp.row_count > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge className="border-success/25 bg-success/10 text-success">
                      {imp.validated_count} validé{imp.validated_count > 1 ? 's' : ''}
                    </Badge>
                    {imp.exception_count > 0 && (
                      <Badge className="border-amber-500/25 bg-amber-500/10 text-amber-600">
                        {imp.exception_count} exception{imp.exception_count > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
