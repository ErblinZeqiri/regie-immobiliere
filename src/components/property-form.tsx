'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createProperty, updateProperty } from '@/actions/properties'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export interface OwnerOption {
  id: string
  full_name: string | null
}

export interface PropertyFormValues {
  id?: string
  reference: string
  title: string
  description: string
  address: string
  city: string
  type: string
  surface: string
  rooms: string
  floor: string
  status: string
  is_public: boolean
  ownerId: string
}

const EMPTY: PropertyFormValues = {
  reference: '',
  title: '',
  description: '',
  address: '',
  city: 'Ferizaj',
  type: 'apartment',
  surface: '',
  rooms: '',
  floor: '',
  status: 'available',
  is_public: false,
  ownerId: '',
}

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function PropertyForm({
  mode,
  owners,
  initial,
}: {
  mode: 'create' | 'edit'
  owners: OwnerOption[]
  initial?: PropertyFormValues
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<PropertyFormValues>(initial ?? EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const set = <K extends keyof PropertyFormValues>(key: K, value: PropertyFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const buildPayload = () => ({
    reference: form.reference.trim() || undefined,
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    address: form.address.trim() || undefined,
    city: form.city.trim() || 'Ferizaj',
    type: (form.type || undefined) as
      | 'apartment'
      | 'house'
      | 'commercial'
      | 'land'
      | 'other'
      | undefined,
    surface: form.surface !== '' ? Number(form.surface) : undefined,
    rooms: form.rooms !== '' ? Number(form.rooms) : undefined,
    floor: form.floor !== '' ? Number(form.floor) : undefined,
    status: form.status as 'available' | 'rented' | 'maintenance' | 'sold',
    is_public: form.is_public,
    ownerId: form.ownerId || undefined,
  })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      if (mode === 'create') {
        const res = await createProperty(buildPayload())
        if (!res.ok) return setError(res.error)
        router.push(`/admin/biens/${res.data.id}`) // vers l'édition (ajout de photos)
      } else {
        const res = await updateProperty({ id: form.id!, ...buildPayload() })
        if (!res.ok) return setError(res.error)
        setSuccess(true)
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Titre *</Label>
          <Input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="reference">Référence</Label>
          <Input
            id="reference"
            value={form.reference}
            onChange={(e) => set('reference', e.target.value)}
            placeholder="FER-006"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <select id="type" className={selectClass} value={form.type} onChange={(e) => set('type', e.target.value)}>
            <option value="apartment">Appartement</option>
            <option value="house">Maison</option>
            <option value="commercial">Local commercial</option>
            <option value="land">Terrain</option>
            <option value="other">Autre</option>
          </select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="address">Adresse</Label>
          <Input id="address" value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">Ville</Label>
          <Input id="city" value={form.city} onChange={(e) => set('city', e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="surface">Surface (m²)</Label>
          <Input
            id="surface"
            type="number"
            step="0.01"
            min="0"
            value={form.surface}
            onChange={(e) => set('surface', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rooms">Pièces</Label>
          <Input
            id="rooms"
            type="number"
            min="0"
            value={form.rooms}
            onChange={(e) => set('rooms', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="floor">Étage</Label>
          <Input
            id="floor"
            type="number"
            value={form.floor}
            onChange={(e) => set('floor', e.target.value)}
            placeholder="0 = RDC"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Statut</Label>
          <select id="status" className={selectClass} value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="available">Disponible</option>
            <option value="rented">Loué</option>
            <option value="maintenance">Entretien</option>
            <option value="sold">Vendu</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ownerId">Propriétaire</Label>
          <select
            id="ownerId"
            className={selectClass}
            value={form.ownerId}
            onChange={(e) => set('ownerId', e.target.value)}
          >
            <option value="">— Aucun —</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name ?? o.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            rows={4}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={form.is_public}
            onChange={(e) => set('is_public', e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <span className="text-sm">Publier dans les annonces publiques</span>
        </label>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-600" role="status">
          Bien enregistré.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Enregistrement…' : mode === 'create' ? 'Créer le bien' : 'Enregistrer'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/admin/biens')}>
          Retour
        </Button>
      </div>
    </form>
  )
}
