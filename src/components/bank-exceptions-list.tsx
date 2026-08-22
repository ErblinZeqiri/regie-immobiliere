'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SimpleSelect } from '@/components/simple-select'
import { resolveBankTransaction } from '@/actions/reconciliation'

export interface ExceptionRow {
  id: string
  tx_date: string | null
  amount: string
  label: string | null
  note: string | null
  matched_charge_id: string | null
}
export interface ChargeOption {
  value: string
  label: string
}

const eur = (v: number | string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))

export function BankExceptionsList({
  exceptions,
  openCharges,
}: {
  exceptions: ExceptionRow[]
  openCharges: ChargeOption[]
}) {
  if (exceptions.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed py-10 text-center text-sm text-muted-foreground">
        Aucune exception à traiter. Tout est rapproché.
      </div>
    )
  }
  return (
    <div className="divide-y overflow-hidden rounded-[10px] border border-border bg-card">
      {exceptions.map((e) => (
        <ExceptionItem key={e.id} exception={e} openCharges={openCharges} />
      ))}
    </div>
  )
}

function ExceptionItem({ exception: e, openCharges }: { exception: ExceptionRow; openCharges: ChargeOption[] }) {
  const router = useRouter()
  const [chargeId, setChargeId] = useState(e.matched_charge_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(action: 'validate' | 'ignore') {
    setError(null)
    if (action === 'validate' && !chargeId) { setError('Choisissez une échéance.'); return }
    startTransition(async () => {
      const res = await resolveBankTransaction({ txId: e.id, action, chargeId: chargeId || undefined })
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="amount text-sm">{eur(e.amount)}</span>
            <span className="text-xs text-muted-foreground">{e.tx_date ?? ''}</span>
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{e.label}</p>
          {e.note && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {e.note}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <SimpleSelect
            value={chargeId}
            onValueChange={setChargeId}
            options={[{ value: '', label: 'Rapprocher sur…' }, ...openCharges]}
            placeholder="Rapprocher sur…"
          />
        </div>
        <Button size="sm" onClick={() => run('validate')} disabled={pending}>
          <Check className="h-4 w-4" />
          Rapprocher
        </Button>
        <Button size="sm" variant="outline" onClick={() => run('ignore')} disabled={pending}>
          <X className="h-4 w-4" />
          Ignorer
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
