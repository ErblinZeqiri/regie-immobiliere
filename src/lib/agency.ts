import 'server-only'
import { createUserClient } from '@/lib/supabase/server'

export interface AgencySettings {
  legalName: string
  address: string | null
  city: string | null
  country: string | null
  email: string | null
  phone: string | null
  iban: string | null
  accountHolder: string | null
  legalMentions: string | null
}

const DEFAULTS: AgencySettings = {
  legalName: 'Pron Gérance',
  address: null,
  city: 'Ferizaj',
  country: 'Kosovo',
  email: null,
  phone: null,
  iban: null,
  accountHolder: null,
  legalMentions: null,
}

/**
 * Lit les paramètres de la régie (ligne unique). Client utilisateur → RLS :
 * lisible par tout authentifié. Renvoie des valeurs par défaut si absent.
 */
export async function getAgencySettings(): Promise<AgencySettings> {
  const supabase = await createUserClient()
  const { data } = await supabase
    .from('agency_settings')
    .select('legal_name, address, city, country, email, phone, iban, account_holder, legal_mentions')
    .eq('id', 1)
    .maybeSingle()
  if (!data) return DEFAULTS
  return {
    legalName: data.legal_name ?? DEFAULTS.legalName,
    address: data.address,
    city: data.city,
    country: data.country,
    email: data.email,
    phone: data.phone,
    iban: data.iban,
    accountHolder: data.account_holder,
    legalMentions: data.legal_mentions,
  }
}
