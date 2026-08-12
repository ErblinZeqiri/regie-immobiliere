'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { createUserAccount, updateUserProfile } from '@/actions/users'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SimpleSelect } from '@/components/simple-select'

type Role = 'owner' | 'tenant'
type Lang = 'sq' | 'fr' | 'de' | 'en'

export interface UserFormInitial {
  id: string
  fullName: string
  email: string
  phone: string
  preferredLanguage: Lang
}

const LANGS: { value: Lang; label: string }[] = [
  { value: 'sq', label: 'Shqip' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
]

function randomPassword(len = 12) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const arr = new Uint32Array(len)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => chars[n % chars.length]).join('')
}

export function UserAccountForm({
  mode,
  role,
  initial,
}: {
  mode: 'create' | 'edit'
  role: Role
  initial?: UserFormInitial
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const label = role === 'owner' ? 'propriétaire' : 'locataire'
  const listPath = role === 'owner' ? '/admin/proprietaires' : '/admin/locataires'

  const [fullName, setFullName] = useState(initial?.fullName ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [lang, setLang] = useState<Lang>(initial?.preferredLanguage ?? 'sq')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      if (mode === 'create') {
        const res = await createUserAccount({
          role,
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          preferredLanguage: lang,
          password,
        })
        if (!res.ok) return setError(res.error)
        router.push(listPath)
      } else {
        const res = await updateUserProfile({
          id: initial!.id,
          role,
          fullName: fullName.trim(),
          phone: phone.trim() || undefined,
          preferredLanguage: lang,
        })
        if (!res.ok) return setError(res.error)
        setSuccess(true)
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="fullName">Nom complet</Label>
          <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={mode === 'edit'}
            autoComplete="off"
          />
          {mode === 'edit' && (
            <p className="text-xs text-muted-foreground">L’e-mail ne se modifie pas ici.</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lang">Langue préférée</Label>
          <SimpleSelect
            id="lang"
            value={lang}
            onValueChange={(v) => setLang(v as Lang)}
            options={LANGS}
          />
        </div>

        {mode === 'create' && (
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe initial</Label>
            <div className="flex gap-2">
              <Input
                id="password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="off"
                placeholder="Min. 8 caractères"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Générer un mot de passe"
                onClick={() => setPassword(randomPassword())}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              À communiquer au {label} — il pourra le changer ensuite.
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-600" role="status">
          Profil enregistré.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? 'Enregistrement…'
            : mode === 'create'
              ? `Créer le ${label}`
              : 'Enregistrer'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(listPath)}>
          Retour
        </Button>
      </div>
    </form>
  )
}
