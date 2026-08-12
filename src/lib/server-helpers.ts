import 'server-only'
import { ZodError } from 'zod'
import { AuthzError } from '@/lib/auth/guards'
import type { ActionResult } from '@/lib/types'

/** Arrondit un montant (number ou string venant d'une colonne numeric) au centime. */
export function round2(value: number | string): number {
  const n = typeof value === 'string' ? Number(value) : value
  return Math.round((n + Number.EPSILON) * 100) / 100
}

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

/** 'YYYY-MM' -> 'Mars 2026'. */
export function monthLabelFr(month: string): string {
  const [year, m] = month.split('-')
  return `${MONTHS_FR[Number(m) - 1]} ${year}`
}

/** Erreur Postgres remontée par supabase-js (shape PostgrestError). */
function isPostgrestError(e: unknown): e is { code: string; message: string; details?: string } {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e
}

/**
 * Convertit n'importe quelle exception en ActionResult d'erreur sérialisable.
 * Centralise le mapping (validation, autorisation, contraintes SQL).
 */
export function toActionError(e: unknown): ActionResult<never> {
  if (e instanceof ZodError) {
    return { ok: false, error: 'Données invalides', code: 'validation', issues: e.flatten() }
  }
  if (e instanceof AuthzError) {
    return { ok: false, error: e.message, code: e.code }
  }
  if (isPostgrestError(e)) {
    switch (e.code) {
      case '23505':
        return { ok: false, error: 'Cet enregistrement existe déjà.', code: 'duplicate' }
      case '23503':
        return { ok: false, error: 'Référence invalide (élément lié introuvable).', code: 'fk' }
      case '23514':
        return { ok: false, error: 'Valeur non conforme aux contraintes.', code: 'check' }
      default:
        return { ok: false, error: e.message, code: e.code }
    }
  }
  return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' }
}
