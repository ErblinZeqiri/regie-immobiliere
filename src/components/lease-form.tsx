'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createLease } from '@/actions/leases'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect, type SelectOption } from '@/components/simple-select'

const today = () => new Date().toISOString().slice(0, 10)

export function LeaseForm({
  properties,
  tenants,
}: {
  properties: SelectOption[]
  tenants: SelectOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [propertyId, setPropertyId] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState('')
  const [rent, setRent] = useState('')
  const [charges, setCharges] = useState('')
  const [deposit, setDeposit] = useState('')
  const [genFirst, setGenFirst] = useState(true)
  const [markRented, setMarkRented] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!propertyId) return setError('Sélectionnez un bien.')
    if (!tenantId) return setError('Sélectionnez un locataire.')
    startTransition(async () => {
      const res = await createLease({
        propertyId,
        tenantId,
        startDate,
        endDate: endDate || undefined,
        rentAmount: Number(rent),
        chargesAmount: charges !== '' ? Number(charges) : 0,
        depositAmount: deposit !== '' ? Number(deposit) : 0,
        generateFirstCharge: genFirst,
        markPropertyRented: markRented,
      })
      if (!res.ok) return setError(res.error)
      router.push(`/admin/baux/${res.data.lease.id}`)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="property">Bien</Label>
          <SimpleSelect
            id="property"
            value={propertyId}
            onValueChange={setPropertyId}
            options={properties}
            placeholder="Choisir un bien"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tenant">Locataire</Label>
          <SimpleSelect
            id="tenant"
            value={tenantId}
            onValueChange={setTenantId}
            options={tenants}
            placeholder="Choisir un locataire"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="start">Date de début</Label>
          <Input id="start" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="end">Date de fin (optionnel)</Label>
          <Input id="end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rent">Loyer (€)</Label>
          <Input id="rent" type="number" step="0.01" min="0.01" required value={rent} onChange={(e) => setRent(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="charges">Charges (€)</Label>
          <Input id="charges" type="number" step="0.01" min="0" value={charges} onChange={(e) => setCharges(e.target.value)} placeholder="0" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="deposit">Dépôt de garantie (€)</Label>
          <Input id="deposit" type="number" step="0.01" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={genFirst} onChange={(e) => setGenFirst(e.target.checked)} className="h-4 w-4 rounded border-input" />
          <span className="text-sm">Générer l’échéance du mois de début</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={markRented} onChange={(e) => setMarkRented(e.target.checked)} className="h-4 w-4 rounded border-input" />
          <span className="text-sm">Passer le bien en statut « loué »</span>
        </label>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Création…' : 'Créer le bail'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/admin/baux')}>
          Retour
        </Button>
      </div>
    </form>
  )
}
