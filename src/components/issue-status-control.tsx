'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setIssueStatus } from '@/actions/issues'
import { SimpleSelect } from '@/components/simple-select'

const STATUS_OPTIONS = [
  { value: 'open', label: 'Ouvert' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'resolved', label: 'Résolu' },
  { value: 'closed', label: 'Clôturé' },
  { value: 'archived', label: 'Archivé' },
]

export function IssueStatusControl({ id, status }: { id: string; status: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const onChange = (next: string) => {
    startTransition(async () => {
      const res = await setIssueStatus({
        id,
        status: next as 'open' | 'in_progress' | 'resolved' | 'closed' | 'archived',
      })
      if (res.ok) router.refresh()
    })
  }

  return (
    <SimpleSelect
      value={status}
      onValueChange={onChange}
      options={STATUS_OPTIONS}
      className="w-36"
    />
  )
}
