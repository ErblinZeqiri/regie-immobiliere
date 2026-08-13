'use client'

import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'

export function LoyersMonthNav({ month }: { month: string }) {
  const router = useRouter()
  return (
    <Input
      type="month"
      defaultValue={month}
      aria-label="Mois"
      className="w-44"
      onChange={(e) => {
        if (e.target.value) router.push(`/admin/loyers?mois=${e.target.value}`)
      }}
    />
  )
}
