/** Villes du Kosovo + centres approximatifs — filtre géographique « ville + rayon ». */
export interface KosovoCity {
  name: string
  lat: number
  lng: number
}

export const KOSOVO_CITIES: KosovoCity[] = [
  { name: 'Prishtinë', lat: 42.6629, lng: 21.1655 },
  { name: 'Ferizaj', lat: 42.3703, lng: 21.155 },
  { name: 'Prizren', lat: 42.2139, lng: 20.7397 },
  { name: 'Pejë', lat: 42.6592, lng: 20.2887 },
  { name: 'Gjakovë', lat: 42.3803, lng: 20.4308 },
  { name: 'Gjilan', lat: 42.4637, lng: 21.4694 },
  { name: 'Mitrovicë', lat: 42.8914, lng: 20.866 },
  { name: 'Vushtrri', lat: 42.8231, lng: 20.9675 },
  { name: 'Podujevë', lat: 42.911, lng: 21.193 },
  { name: 'Suharekë', lat: 42.3586, lng: 20.8253 },
  { name: 'Rahovec', lat: 42.3994, lng: 20.6547 },
  { name: 'Lipjan', lat: 42.5217, lng: 21.1258 },
  { name: 'Malishevë', lat: 42.4822, lng: 20.7458 },
  { name: 'Kamenicë', lat: 42.5786, lng: 21.5803 },
  { name: 'Deçan', lat: 42.5406, lng: 20.2892 },
  { name: 'Istog', lat: 42.7803, lng: 20.4869 },
  { name: 'Klinë', lat: 42.6203, lng: 20.5772 },
  { name: 'Skenderaj', lat: 42.7469, lng: 20.7889 },
  { name: 'Viti', lat: 42.3211, lng: 21.3578 },
  { name: 'Fushë Kosovë', lat: 42.6428, lng: 21.0961 },
  { name: 'Obiliq', lat: 42.6872, lng: 21.0703 },
  { name: 'Dragash', lat: 42.0619, lng: 20.6531 },
]

/** Centre géographique du pays (vue initiale de la carte). */
export const KOSOVO_CENTER: [number, number] = [42.58, 20.9]

/** Distance en km entre deux points (formule de haversine). */
export function haversineKm(
  [lat1, lng1]: [number, number],
  [lat2, lng2]: [number, number],
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Zoom Leaflet adapté à un rayon (km) autour d'une ville. */
export function zoomForRadius(radiusKm: number | null): number {
  if (radiusKm == null) return 12
  if (radiusKm <= 5) return 13
  if (radiusKm <= 10) return 12
  if (radiusKm <= 25) return 11
  if (radiusKm <= 50) return 10
  return 9
}
