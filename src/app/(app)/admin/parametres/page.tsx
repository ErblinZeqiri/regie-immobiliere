import { getAgencySettings } from '@/lib/agency'
import { AgencySettingsForm } from '@/components/agency-settings-form'

export const dynamic = 'force-dynamic'

export default async function ParametresPage() {
  const settings = await getAgencySettings()

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Paramètres de la régie</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ces informations alimentent les documents (avis de paiement, quittances) et le pied de
          page du site public.
        </p>
      </header>
      <AgencySettingsForm settings={settings} />
    </div>
  )
}
