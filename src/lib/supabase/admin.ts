import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Client Supabase "service_role" — CONTOURNE LA RLS.
 *
 * ⚠️ DANGER : ce client a tous les droits sur la base. Ne l'utilise JAMAIS
 * côté client, ni sans avoir vérifié AVANT l'autorisation de l'appelant
 * (ex : requireAdmin()). La clé service_role ne doit exister que côté serveur
 * dans SUPABASE_SERVICE_ROLE_KEY (jamais préfixée NEXT_PUBLIC_).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Configuration manquante : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis côté serveur.',
    )
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
