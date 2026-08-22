'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { updateAgencySettings, type UpdateAgencyInput } from '@/actions/agency'
import type { AgencySettings } from '@/lib/agency'

export function AgencySettingsForm({ settings }: { settings: AgencySettings }) {
  const router = useRouter()
  const [form, setForm] = useState<UpdateAgencyInput>({
    legalName: settings.legalName,
    address: settings.address ?? '',
    city: settings.city ?? '',
    country: settings.country ?? '',
    email: settings.email ?? '',
    phone: settings.phone ?? '',
    iban: settings.iban ?? '',
    accountHolder: settings.accountHolder ?? '',
    legalMentions: settings.legalMentions ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const set = (k: keyof UpdateAgencyInput, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setSaved(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await updateAgencySettings(form)
      if (!res.ok) { setError(res.error); return }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <Section title="Identité">
        <Field label="Nom légal de la régie" required>
          <Input value={form.legalName} onChange={(e) => set('legalName', e.target.value)} required />
        </Field>
        <Field label="Adresse">
          <Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Rue et numéro" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ville">
            <Input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Pays">
            <Input value={form.country ?? ''} onChange={(e) => set('country', e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email de contact">
            <Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="contact@…" />
          </Field>
          <Field label="Téléphone">
            <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+383 …" />
          </Field>
        </div>
      </Section>

      <Section title="Coordonnées bancaires">
        <Field label="IBAN">
          <Input value={form.iban ?? ''} onChange={(e) => set('iban', e.target.value)} placeholder="XK00 0000 0000 0000 0000" className="font-mono" />
        </Field>
        <Field label="Bénéficiaire du compte" hint="Si différent du nom de la régie">
          <Input value={form.accountHolder ?? ''} onChange={(e) => set('accountHolder', e.target.value)} />
        </Field>
      </Section>

      <Section title="Mentions légales" hint="TVA, registre… (optionnel — apparaît en pied des documents)">
        <Field label="Mentions">
          <Textarea rows={3} value={form.legalMentions ?? ''} onChange={(e) => set('legalMentions', e.target.value)} />
        </Field>
      </Section>

      <div className="flex items-center gap-3 border-t pt-5">
        <Button type="submit" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> Paramètres enregistrés.
          </span>
        )}
        {error && (
          <span className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> {error}
          </span>
        )}
      </div>
    </form>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="stat-label">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
        {hint && <span className="ml-2 font-normal text-muted-foreground">— {hint}</span>}
      </Label>
      {children}
    </div>
  )
}
