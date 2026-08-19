'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Archive, RotateCcw } from 'lucide-react'
import { setThreadStatus } from '@/actions/messages'
import { Button } from '@/components/ui/button'

export function ThreadStatusControl({ threadId, status }: { threadId: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const change = (next: 'open' | 'closed' | 'archived') => {
    startTransition(async () => {
      const res = await setThreadStatus({ threadId, status: next })
      if (res.ok) router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'open' ? (
        <>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={pending} onClick={() => change('closed')}>
            <Lock className="h-4 w-4" />
            Clôturer
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5" disabled={pending} onClick={() => change('archived')}>
            <Archive className="h-4 w-4" />
            Archiver
          </Button>
        </>
      ) : (
        <>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={pending} onClick={() => change('open')}>
            <RotateCcw className="h-4 w-4" />
            Rouvrir
          </Button>
          {status === 'closed' && (
            <Button size="sm" variant="ghost" className="gap-1.5" disabled={pending} onClick={() => change('archived')}>
              <Archive className="h-4 w-4" />
              Archiver
            </Button>
          )}
        </>
      )}
    </div>
  )
}
