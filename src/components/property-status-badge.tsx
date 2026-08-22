import { Badge } from '@/components/ui/badge'

/** Badge de statut d'un bien — cohérent partout (admin, propriétaire…). */
export function PropertyStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'rented':
      return <Badge className="border-success/25 bg-success/10 text-success">Loué</Badge>
    case 'available':
      return <Badge className="border-amber-500/25 bg-amber-500/10 text-amber-600">Vacant</Badge>
    case 'maintenance':
      return <Badge variant="secondary">Entretien</Badge>
    case 'sold':
      return <Badge variant="secondary">Vendu</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}
