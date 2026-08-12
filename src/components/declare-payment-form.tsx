'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { declarePayment } from '@/actions/payments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const METHODS = [
  { value: 'bank_transfer', label: 'Virement bancaire' },
  { value: 'cash', label: 'Espèces' },
  { value: 'card', label: 'Carte' },
  { value: 'other', label: 'Autre' },
] as const

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Formulaire de déclaration de paiement (côté locataire).
 * Appelle declarePayment → le paiement est créé en 'pending' (la régie valide
 * ensuite). L'autorisation réelle est faite par la RLS dans l'action.
 */
export function DeclarePaymentForm({
  leaseId,
  defaultAmount,
}: {
  leaseId: string
  defaultAmount?: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : '')
  const [date, setDate] = useState(today())
  const [method, setMethod] = useState<string>('bank_transfer')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const res = await declarePayment({
        leaseId,
        amount: Number(amount),
        paymentDate: date,
        method: method as 'bank_transfer' | 'cash' | 'card' | 'other',
        reference: reference.trim() || undefined,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSuccess(true)
      setReference('')
      router.refresh() // met à jour l'historique et le solde
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">Montant (€)</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">Date du paiement</Label>
          <Input
            id="date"
            type="date"
            required
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="method">Moyen de paiement</Label>
          <select
            id="method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reference">Référence (optionnel)</Label>
          <Input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Réf. du virement"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-600" role="status">
          Paiement déclaré. Il sera validé par la régie.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Envoi…' : 'Déclarer le paiement'}
      </Button>
    </form>
  )
}
