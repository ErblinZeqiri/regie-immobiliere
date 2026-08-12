'use client'

import { useRef, useState, useTransition } from 'react'
import { Star, Trash2, Upload, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  registerPropertyPhoto,
  setCoverPhoto,
  deletePropertyPhoto,
} from '@/actions/properties'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const BUCKET = 'property-photos'

export interface PhotoItem {
  id: string
  url: string | null
  isCover: boolean
}

function extOf(name: string) {
  const parts = name.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : 'jpg'
}

export function PropertyPhotosManager({
  propertyId,
  initialPhotos,
}: {
  propertyId: string
  initialPhotos: PhotoItem[]
}) {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<PhotoItem[]>(initialPhotos)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        // Convention de chemin OBLIGATOIRE : {propertyId}/{uuid}.{ext}
        const path = `${propertyId}/${crypto.randomUUID()}.${extOf(file.name)}`

        // Upload direct (RLS : l'admin est autorisé sur property-photos)
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false })
        if (upErr) {
          setError(`Échec de l'upload : ${upErr.message}`)
          continue
        }

        // Enregistrement de la métadonnée (+ URL signée renvoyée)
        const res = await registerPropertyPhoto({ propertyId, path })
        if (!res.ok) {
          setError(res.error)
          continue
        }
        setPhotos((prev) => [...prev, { id: res.data.id, url: res.data.url, isCover: res.data.isCover }])
      }
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onSetCover = (photoId: string) => {
    startTransition(async () => {
      const res = await setCoverPhoto({ propertyId, photoId })
      if (!res.ok) return setError(res.error)
      setPhotos((prev) => prev.map((p) => ({ ...p, isCover: p.id === photoId })))
    })
  }

  const onDelete = (photoId: string) => {
    startTransition(async () => {
      const res = await deletePropertyPhoto({ photoId })
      if (!res.ok) return setError(res.error)
      setPhotos((prev) => prev.filter((p) => p.id !== photoId))
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {photos.length} photo{photos.length > 1 ? 's' : ''}
        </p>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="gap-2"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Envoi…' : 'Ajouter des photos'}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {photos.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          Aucune photo. Ajoutez-en pour illustrer l’annonce.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((p) => (
            <div
              key={p.id}
              className={cn(
                'group relative aspect-square overflow-hidden rounded-md border bg-muted',
                p.isCover && 'ring-2 ring-primary',
              )}
            >
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  (aperçu indisponible)
                </div>
              )}

              {p.isCover && (
                <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  <Star className="h-3 w-3 fill-current" /> Couverture
                </span>
              )}

              <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-hover:opacity-100">
                {!p.isCover && (
                  <button
                    type="button"
                    onClick={() => onSetCover(p.id)}
                    title="Définir comme couverture"
                    className="rounded bg-background/90 p-1.5 text-foreground shadow hover:bg-background"
                  >
                    <Star className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  title="Supprimer"
                  className="ml-auto rounded bg-background/90 p-1.5 text-destructive shadow hover:bg-background"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
