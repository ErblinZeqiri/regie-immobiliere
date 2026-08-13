'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip } from 'lucide-react'
import { createIssue, addIssuePhotos } from '@/actions/issues'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SimpleSelect } from '@/components/simple-select'

const PRIORITIES = [
  { value: 'low', label: 'Basse' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'high', label: 'Haute' },
  { value: 'urgent', label: 'Urgente' },
]

function extOf(name: string) {
  const parts = name.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : 'jpg'
}

export function IssueForm({ propertyId, leaseId }: { propertyId: string; leaseId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      const res = await createIssue({
        propertyId,
        leaseId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority: priority as 'low' | 'medium' | 'high' | 'urgent',
      })
      if (!res.ok) return setError(res.error)

      // Upload des photos sous {issueId}/... (RLS : le créateur est autorisé)
      const issueId = res.data.id
      if (files.length > 0) {
        const paths: string[] = []
        for (const f of files) {
          const path = `${issueId}/${crypto.randomUUID()}.${extOf(f.name)}`
          const { error: upErr } = await supabase.storage
            .from('issue-photos')
            .upload(path, f, { contentType: f.type })
          if (!upErr) paths.push(path)
        }
        if (paths.length > 0) await addIssuePhotos({ issueId, fileUrls: paths })
      }

      setSuccess(true)
      setTitle('')
      setDescription('')
      setPriority('medium')
      setFiles([])
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Titre</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Ex. Fuite sous l’évier" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="priority">Priorité</Label>
          <SimpleSelect id="priority" value={priority} onValueChange={setPriority} options={PRIORITIES} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Décrivez le problème…" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="photos" className="flex items-center gap-1.5">
          <Paperclip className="h-4 w-4" aria-hidden />
          Photos (optionnel)
        </Label>
        <Input
          ref={inputRef}
          id="photos"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        {files.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {files.length} photo{files.length > 1 ? 's' : ''} sélectionnée{files.length > 1 ? 's' : ''}
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-600" role="status">
          Signalement envoyé à la régie.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? 'Envoi…' : 'Signaler un problème'}
      </Button>
    </form>
  )
}
