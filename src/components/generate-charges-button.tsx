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
}: {
  leaseId?: string
  label?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
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
      <Input
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="w-40"
        aria-label="Mois à générer"
      />
      <Button type="button" variant="outline" onClick={run} disabled={pending} className="gap-2">
        <CalendarPlus className="h-4 w-4" />
        {pending ? 'Génération…' : label}
      </Button>
      {msg && <span className="text-sm text-green-600">{msg}</span>}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  )
}
