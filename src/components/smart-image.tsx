'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { IMAGE_FALLBACK_GRADIENT } from '@/lib/listing-images'

/**
 * <img> avec repli en cascade : on essaie chaque source dans l'ordre, et en
 * dernier recours un dégradé neutre — jamais d'image cassée à l'écran.
 */
export function SmartImage({
  sources,
  alt,
  className,
  ...rest
}: {
  sources: (string | null | undefined)[]
  alt: string
  className?: string
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>) {
  const chain = [...sources.filter((s): s is string => !!s), IMAGE_FALLBACK_GRADIENT]
  const [i, setI] = useState(0)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={chain[i]}
      alt={alt}
      loading="lazy"
      onError={() => setI((n) => (n < chain.length - 1 ? n + 1 : n))}
      className={cn(i === chain.length - 1 && 'object-cover', className)}
      {...rest}
    />
  )
}
