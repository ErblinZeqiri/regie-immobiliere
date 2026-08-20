import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface Stat {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'default' | 'success' | 'danger' | 'warning'
}

const TONE: Record<NonNullable<Stat['tone']>, string> = {
  default: 'text-foreground',
  success: 'text-success',
  danger: 'text-destructive',
  warning: 'text-amber-600',
}

/**
 * Bandeau de statistiques : une seule surface bordée, découpée en colonnes par
 * des séparateurs internes (plus dense et premium que N cartes séparées).
 */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card lg:grid-cols-4">
      {stats.map((s, i) => (
        <div
          key={i}
          className={cn(
            'px-5 py-4',
            i % 2 === 1 && 'border-l',
            i >= 2 && 'border-t',
            'lg:border-t-0',
            i > 0 && 'lg:border-l',
          )}
        >
          <p className="stat-label">{s.label}</p>
          <p
            className={cn(
              'amount mt-2 text-[1.6rem] leading-none font-bold sm:text-3xl',
              TONE[s.tone ?? 'default'],
            )}
          >
            {s.value}
          </p>
          {s.hint && <p className="mt-1.5 text-xs text-muted-foreground">{s.hint}</p>}
        </div>
      ))}
    </div>
  )
}
