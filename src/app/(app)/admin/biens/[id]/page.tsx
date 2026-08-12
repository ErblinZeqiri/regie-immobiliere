import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createUserClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PropertyForm, type OwnerOption, type PropertyFormValues } from '@/components/property-form'
import { PropertyPhotosManager, type PhotoItem } from '@/components/property-photos-manager'

export const dynamic = 'force-dynamic'

const PROPERTY_PHOTOS_BUCKET = 'property-photos'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EditBienPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) notFound()

  const supabase = await createUserClient()

  const { data: property } = await supabase
    .from('properties')
    .select(
      'id, reference, title, description, address, city, type, surface, rooms, floor, status, is_public, owner_id',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!property) notFound()

  const { data: owners } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'owner')
    .is('deleted_at', null)
    .order('full_name', { ascending: true })

  // Photos + URLs signées
  const { data: photos } = await supabase
    .from('property_photos')
    .select('id, file_url, is_cover, sort_order')
    .eq('property_id', id)
    .is('deleted_at', null)
    .order('is_cover', { ascending: false })
    .order('sort_order', { ascending: true })

  const paths = (photos ?? []).map((p) => p.file_url)
  const signedByPath = new Map<string, string>()
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from(PROPERTY_PHOTOS_BUCKET)
      .createSignedUrls(paths, 60 * 60)
    ;(signed ?? []).forEach((s, i) => {
      if (s.signedUrl) signedByPath.set(paths[i], s.signedUrl)
    })
  }
  const photoItems: PhotoItem[] = (photos ?? []).map((p) => ({
    id: p.id,
    url: signedByPath.get(p.file_url) ?? null,
    isCover: p.is_cover,
  }))

  const initial: PropertyFormValues = {
    id: property.id,
    reference: property.reference ?? '',
    title: property.title,
    description: property.description ?? '',
    address: property.address ?? '',
    city: property.city ?? 'Ferizaj',
    type: property.type ?? 'apartment',
    surface: property.surface != null ? String(property.surface) : '',
    rooms: property.rooms != null ? String(property.rooms) : '',
    floor: property.floor != null ? String(property.floor) : '',
    status: property.status,
    is_public: property.is_public,
    ownerId: property.owner_id ?? '',
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        href="/admin/biens"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux biens
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{property.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <PropertyForm mode="edit" owners={(owners ?? []) as OwnerOption[]} initial={initial} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Photos</CardTitle>
        </CardHeader>
        <CardContent>
          <PropertyPhotosManager propertyId={property.id} initialPhotos={photoItems} />
        </CardContent>
      </Card>
    </div>
  )
}
