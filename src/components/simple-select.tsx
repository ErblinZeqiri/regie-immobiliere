'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface SelectOption {
  value: string
  label: string
}

/**
 * Select stylé (Base UI) réutilisable — options rendues avec la police du design
 * (contrairement au <select> natif dont la liste est dessinée par l'OS).
 */
export function SimpleSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  className = 'w-full',
}: {
  id?: string
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
}) {
  const labels = Object.fromEntries(options.map((o) => [o.value, o.label]))
  return (
    <Select value={value} onValueChange={(v) => onValueChange(String(v))}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={placeholder}>
          {(v: string) => labels[v] ?? placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
