'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setApplicationStatus } from '@/actions/applications'
import { Button } from '@/components/ui/button'

export function ApplicationStatusActions({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const change = (next: 'new' | 'contacted' | 'archived') => {
    setError(null)
    startTransition(async () => {
      const res = await setApplicationStatus({ id, status: next })
      if (!res.ok) return setError(res.error)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      {status !== 'contacted' && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => change('contacted')}>
          Marquer contacté
        </Button>
      )}
      {status !== 'archived' ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => change('archived')}>
          Archiver
        </Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => change('new')}>
          Rouvrir
        </Button>
      )}
    </div>
  )
}
