/**
 * Types partagés (non "use server", donc exportables librement).
 *
 * NOTE : Postgres renvoie les colonnes `numeric` sous forme de STRING via
 * supabase-js (pour ne pas perdre de précision). Les montants sont donc typés
 * `string` ici — parse-les avec Number()/une lib décimale au moment de calculer.
 * Tu peux remplacer ce fichier par les types générés :
 *   supabase gen types typescript --local > src/lib/database.types.ts
 */

export type AppRole = 'admin' | 'owner' | 'tenant'

export type PaymentStatus = 'pending' | 'validated' | 'rejected'
export type PaymentMethod = 'bank_transfer' | 'cash' | 'card' | 'other'
export type ChargeType = 'rent' | 'charges' | 'other'
export type LeaseStatus = 'active' | 'ended' | 'terminated'

export interface Lease {
  id: string
  property_id: string
  tenant_id: string
  start_date: string
  end_date: string | null
  rent_amount: string
  charges_amount: string
  deposit_amount: string
  status: LeaseStatus
}

export interface RentCharge {
  id: string
  lease_id: string
  due_date: string
  period: string | null
  label: string | null
  amount: string
  type: ChargeType
  status: 'active' | 'cancelled'
}

export interface Payment {
  id: string
  lease_id: string
  amount: string
  payment_date: string
  method: PaymentMethod | null
  reference: string | null
  proof_url: string | null
  status: PaymentStatus
  validated_by: string | null
  validated_at: string | null
}

export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type IssuePriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Issue {
  id: string
  property_id: string
  lease_id: string | null
  created_by: string
  title: string
  description: string | null
  status: IssueStatus
  priority: IssuePriority
}

export interface IssuePhoto {
  id: string
  issue_id: string
  file_url: string
}

export interface MessageThread {
  id: string
  property_id: string | null
  lease_id: string | null
  subject: string | null
}

export interface Message {
  id: string
  thread_id: string
  sender_id: string
  content: string
  created_at: string
}

export interface DocumentRow {
  id: string
  property_id: string | null
  lease_id: string | null
  uploaded_by: string | null
  type: string | null
  name: string | null
  file_url: string
}

/**
 * Résultat uniforme d'une Server Action. Discriminé par `ok` : le composant
 * appelant fait `if (res.ok) { res.data } else { res.error }`. Toujours
 * sérialisable (pas d'exception qui traverse la frontière serveur/client).
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; issues?: unknown }
