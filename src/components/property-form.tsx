'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createProperty, updateProperty } from '@/actions/properties'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SimpleSelect } from '@/components/simple-select'

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

const TYPE_OPTIONS = [
  { value: 'apartment', label: 'Appartement' },
  { value: 'house', label: 'Maison' },
  { value: 'commercial', label: 'Local commercial' },
  { value: 'land', label: 'Terrain' },
  { value: 'other', label: 'Autre' },
]
const STATUS_OPTIONS = [
  { value: 'available', label: 'Disponible' },
  { value: 'rented', label: 'Loué' },
  { value: 'maintenance', label: 'Entretien' },
  { value: 'sold', label: 'Vendu' },
]

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
    // Terrain : ni pièces ni étage
    rooms: form.type !== 'land' && form.rooms !== '' ? Number(form.rooms) : undefined,
    floor: form.type !== 'land' && form.floor !== '' ? Number(form.floor) : undefined,
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
          <SimpleSelect id="type" value={form.type} onValueChange={(v) => set('type', v)} options={TYPE_OPTIONS} />
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

        {/* Pièces & étage : non pertinents pour un terrain */}
        {form.type !== 'land' && (
          <>
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
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="status">Statut</Label>
          <SimpleSelect id="status" value={form.status} onValueChange={(v) => set('status', v)} options={STATUS_OPTIONS} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ownerId">Propriétaire</Label>
          <SimpleSelect
            id="ownerId"
            value={form.ownerId}
            onValueChange={(v) => set('ownerId', v)}
            placeholder="— Aucun —"
            options={[
              { value: '', label: '— Aucun —' },
              ...owners.map((o) => ({ value: o.id, label: o.full_name ?? o.id.slice(0, 8) })),
            ]}
          />
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
        <p className="text-sm text-success" role="status">
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
