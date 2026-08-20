'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'
import { generateRentCharges } from '@/actions/rent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Génère les échéances d'un mois. Si `leaseId` est fourni, cible ce bail ;
 * sinon tous les baux actifs. Idempotent (pas de doublon si relancé).
 */
export function GenerateChargesButton({
  leaseId,
  label = 'Générer les échéances',
  defaultMonth,
  hideMonthInput = false,
}: {
  leaseId?: string
  label?: string
  defaultMonth?: string
  /** Masque le sélecteur de mois : génère alors le mois `defaultMonth`. */
  hideMonthInput?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [monthState, setMonthState] = useState(defaultMonth ?? new Date().toISOString().slice(0, 7))
  const month = hideMonthInput ? (defaultMonth ?? monthState) : monthState
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = () => {
    setMsg(null)
    setError(null)
    startTransition(async () => {
      const res = await generateRentCharges({ month, leaseId })
      if (!res.ok) return setError(res.error)
      setMsg(
        `${res.data.created} créée${res.data.created > 1 ? 's' : ''} · ${res.data.skipped} déjà présente${res.data.skipped > 1 ? 's' : ''}`,
      )
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!hideMonthInput && (
        <Input
          type="month"
          value={monthState}
          onChange={(e) => setMonthState(e.target.value)}
          className="w-40"
          aria-label="Mois à générer"
        />
      )}
      <Button type="button" variant="outline" onClick={run} disabled={pending} className="gap-2">
        <CalendarPlus className="h-4 w-4" />
        {pending ? 'Génération…' : label}
      </Button>
      {msg && <span className="text-sm text-success">{msg}</span>}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  )
}
