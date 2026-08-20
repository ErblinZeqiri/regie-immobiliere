'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { SmartImage } from '@/components/smart-image'

/**
 * Galerie photo. Si aucune vraie photo n'est chargée, on retombe sur un visuel
 * de secours (Unsplash) plutôt qu'un placeholder vide — la vitrine reste belle.
 */
export function PropertyGallery({
  images,
  title,
  fallback,
}: {
  images: string[]
  title: string
  fallback?: string
}) {
  const [active, setActive] = useState(0)
  const shots = images.length > 0 ? images : fallback ? [fallback] : []

  if (shots.length === 0) {
    return <div className="photo-placeholder aspect-[16/10] w-full rounded-[10px] border border-border" />
  }

  return (
    <div className="space-y-3">
      <div className="aspect-[16/10] w-full overflow-hidden rounded-[10px] border border-border bg-muted">
        <SmartImage
          sources={[shots[active], fallback]}
          alt={`${title} — photo ${active + 1}`}
          className="h-full w-full object-cover"
        />
      </div>

      {shots.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {shots.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Voir la photo ${i + 1}`}
              aria-current={i === active}
              className={cn(
                'aspect-square overflow-hidden rounded-md border-2 transition',
                i === active ? 'border-primary' : 'border-transparent hover:border-muted-foreground/40',
              )}
            >
              <SmartImage sources={[src, fallback]} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
