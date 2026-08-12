import { createBrowserClient } from '@supabase/ssr'

/**
 * Client Supabase côté NAVIGATEUR (composants 'use client').
 * Porte la session de l'utilisateur connecté via les cookies : soumis à la RLS.
 * Utilisé ici pour l'upload direct de fichiers vers Storage (l'admin est
 * autorisé par la policy property_photos_admin_insert).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
