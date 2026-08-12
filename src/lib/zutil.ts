import { z } from 'zod'

/**
 * UUID tolérant (8-4-4-4-12 hexadécimal), insensible à la version/variante.
 *
 * Pourquoi ne pas utiliser z.uuid() / z.string().uuid() : en Zod 4, ce
 * validateur est devenu strict (RFC 9562 : chiffres de version et de variante
 * imposés). Les UUID « lisibles » du seed (ex. d0000000-0000-0000-0000-…) ne
 * les respectent pas et seraient rejetés. Les UUID réels générés par la base
 * (gen_random_uuid) passent de toute façon ce format ; les contraintes FK de la
 * base restent le vrai garde-fou.
 */
export const zuuid = () =>
  z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Identifiant invalide')
