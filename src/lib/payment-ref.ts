/**
 * Référence de paiement d'une échéance — stable, unique et lisible dans un
 * libellé de virement. Format : PG-<BIEN>-<AAAAMM>[C|O]
 *   ex. PG-FER001-202608   (loyer)   ·   PG-FER001-202608C  (charges)
 *
 * La MÊME logique est répliquée en SQL (patch_payment_refs.sql) pour le backfill,
 * afin que les références existantes et futures soient identiques.
 */
export function buildPaymentRef(
  propertyRef: string | null | undefined,
  period: string, // 'YYYY-MM-01' ou 'YYYY-MM'
  type: string, // 'rent' | 'charges' | 'other'
): string {
  const prop = (propertyRef ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'XXX'
  const yyyymm = `${period.slice(0, 4)}${period.slice(5, 7)}`
  const suffix = type === 'charges' ? 'C' : type === 'other' ? 'O' : ''
  return `PG-${prop}-${yyyymm}${suffix}`
}

/** Normalise un texte pour le matching (majuscules, sans espaces ni ponctuation). */
export function normalizeForMatch(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
