'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SendHorizontal } from 'lucide-react'
import { sendMessage } from '@/actions/messages'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function MessageReplyForm({ threadId }: { threadId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmed = content.trim()
    if (!trimmed) return
    startTransition(async () => {
      const res = await sendMessage({ threadId, content: trimmed })
      if (!res.ok) return setError(res.error)
      setContent('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-1">
      <div className="flex items-end gap-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder="Votre message…"
          className="flex-1 resize-none"
        />
        <Button type="submit" size="icon" disabled={pending} aria-label="Envoyer">
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
