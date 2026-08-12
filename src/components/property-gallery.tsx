'use client'

import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PropertyGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0)

  if (images.length === 0) {
    return (
      <div className="photo-placeholder aspect-[16/10] w-full rounded-xl ring-1 ring-foreground/[0.06]">
        <Building2 className="h-16 w-16 opacity-80" aria-hidden strokeWidth={1.1} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="aspect-[16/10] w-full overflow-hidden rounded-lg bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[active]}
          alt={`${title} — photo ${active + 1}`}
          className="h-full w-full object-cover"
        />
      </div>

      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {images.map((src, i) => (
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
