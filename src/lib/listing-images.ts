/**
 * Visuels de secours (Unsplash) — utilisés tant que les vraies photos ne sont pas
 * chargées dans le storage. Sélection déterministe par identifiant de bien pour
 * qu'une annonce garde toujours la même image entre deux rendus.
 *
 * NB : on sert ces URLs via de simples <img> (le repli `onError` bascule sur un
 * dégradé si jamais Unsplash renvoie une 404), donc aucune config next/image.
 */

const U = (id: string, w = 1200) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`

// Intérieurs / immeubles lumineux — pour apartments par défaut.
const INTERIORS = [
  '1502672260266-1c1ef2d93688',
  '1560448204-e02f11c3d0e2',
  '1493809842364-78817add7ffb',
  '1522708323590-d24dbb6b0267',
  '1600585154340-be6161a56a0c',
  '1600607687939-ce8a6c25118c',
  '1600566753086-00f18fb6b3ea',
  '1560185007-cde436f6a4d0',
]

const BY_TYPE: Record<string, string[]> = {
  house: ['1568605114967-8130f3a36994', '1512917774080-9991f1c4c750', '1570129477492-45c003edd2be'],
  commercial: ['1441986300917-64674bd600d8', '1497366216548-37526070297c', '1524758631624-e2822e304c36'],
  land: ['1500382017468-9049fed747ef', '1416879595882-3373a0480b5b', '1501004318641-b39e6451bec6'],
}

function pick(list: string[], seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return list[h % list.length]
}

/** Image de secours pour une annonce, selon son type et son id. */
export function fallbackImage(id: string, type: string | null, w = 1200): string {
  const pool = (type && BY_TYPE[type]) || INTERIORS
  return U(pick(pool, id), w)
}

/** Dégradé neutre encodé (data URI) en dernier recours si même Unsplash échoue. */
export const IMAGE_FALLBACK_GRADIENT =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='12'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23ece8e1'/%3E%3Cstop offset='1' stop-color='%23dcd6cc'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='16' height='12' fill='url(%23g)'/%3E%3C/svg%3E"

// Visuels éditoriaux de la page d'accueil. Chaque clé est essayée puis, en cas
// d'échec Unsplash, retombe sur la variante *Fallback via <SmartImage>.
export const HOME_IMAGES = {
  hero: U('1480714378408-67cf0d13bc1b', 2400), // ville en soirée, vue d'ensemble (non-monument)
  heroFallback: U('1449824913935-59a10b8d2000', 2000),
  owners: U('1554224155-6726b3ff858f', 1300),
  tenants: U('1600607687939-ce8a6c25118c', 1300),
  transparency: U('1460925895917-afdab827c52f', 1300),
  quote: U('1523217582562-09d0def993a6', 1400), // architecture / immeuble
  quoteFallback: U('1486406146926-c627a92ad1ab', 1400),
  band: U('1467269204594-9661b134dd2b', 2200), // ville vue du ciel
  bandFallback: U('1449824913935-59a10b8d2000', 1800),
  city: U('1486406146926-c627a92ad1ab', 1800),
}
