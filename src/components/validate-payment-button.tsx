'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { validatePayment } from '@/actions/payments'
import { Button } from '@/components/ui/button'

/**
 * Bouton « Valider » — appelle la Server Action validatePayment (auto-allocation
 * FIFO). En cas de succès on rafraîchit les données serveur (router.refresh()).
 * L'autorisation réelle est faite dans l'action (requireAdmin) : ce bouton n'est
 * qu'un déclencheur.
 */
export function ValidatePaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onValidate = () => {
    setError(null)
    startTransition(async () => {
      const res = await validatePayment({ paymentId })
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={onValidate} disabled={pending} className="gap-1.5">
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        {pending ? 'Validation…' : 'Valider'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
