'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startThread } from '@/actions/messages'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SimpleSelect, type SelectOption } from '@/components/simple-select'

/**
 * Ouvre un fil avec la régie.
 * - Locataire : `leaseId` fixe (son bail).
 * - Propriétaire : choix parmi ses biens (`properties`).
 */
export function NewThreadForm({
  basePath,
  leaseId,
  properties,
}: {
  basePath: string
  leaseId?: string
  properties?: SelectOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [subject, setSubject] = useState('')
  const [propertyId, setPropertyId] = useState(properties?.[0]?.value ?? '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!message.trim()) return setError('Écrivez un message.')
    if (properties && !propertyId) return setError('Choisissez un bien.')
    startTransition(async () => {
      const res = await startThread({
        subject: subject.trim() || undefined,
        firstMessage: message.trim(),
        leaseId: leaseId,
        propertyId: properties ? propertyId : undefined,
      })
      if (!res.ok) return setError(res.error)
      router.push(`${basePath}/${res.data.thread.id}`)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="subject">Sujet (optionnel)</Label>
          <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex. Question sur le bail" />
        </div>
        {properties && (
          <div className="space-y-2">
            <Label htmlFor="property">Bien concerné</Label>
            <SimpleSelect id="property" value={propertyId} onValueChange={setPropertyId} options={properties} placeholder="Choisir un bien" />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">Message</Label>
        <Textarea id="message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Votre message à la régie…" required />
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Envoi…' : 'Démarrer la conversation'}
      </Button>
    </form>
  )
}
