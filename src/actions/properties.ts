'use server'

import { z } from 'zod'
import { zuuid } from '@/lib/zutil'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { round2, toActionError } from '@/lib/server-helpers'
import type { ActionResult } from '@/lib/types'

const PROPERTY_PHOTOS_BUCKET = 'property-photos'

// ---------------------------------------------------------------------------
// Champs communs création / édition
// ---------------------------------------------------------------------------
const PropertyFields = z.object({
  reference: z.string().max(50).optional(),
  title: z.string().min(2, 'Titre trop court').max(150),
  description: z.string().max(5000).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).default('Ferizaj'),
  type: z.enum(['apartment', 'house', 'commercial', 'land', 'other']).optional(),
  surface: z.number().positive().optional(),
  rooms: z.number().int().min(0).max(100).optional(),
  floor: z.number().int().min(-5).max(200).optional(),
  status: z.enum(['available', 'rented', 'maintenance', 'sold']).default('available'),
  is_public: z.boolean().default(false),
  ownerId: zuuid().optional(),
})

function toRow(data: z.infer<typeof PropertyFields>) {
  return {
    reference: data.reference ?? null,
    title: data.title,
    description: data.description ?? null,
    address: data.address ?? null,
    city: data.city,
    type: data.type ?? null,
    surface: data.surface != null ? round2(data.surface) : null,
    rooms: data.rooms ?? null,
    floor: data.floor ?? null,
    status: data.status,
    is_public: data.is_public,
    owner_id: data.ownerId ?? null,
  }
}

// ===========================================================================
// createProperty — ADMIN
// ===========================================================================
export type CreatePropertyInput = z.input<typeof PropertyFields>

export async function createProperty(
  input: CreatePropertyInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const data = PropertyFields.parse(input)
    await requireAdmin()
    const admin = createAdminClient()

    const { data: property, error } = await admin
      .from('properties')
      .insert(toRow(data))
      .select('id')
      .single()
    if (error) throw error

    revalidatePath('/admin/biens')
    return { ok: true, data: { id: property.id } }
  } catch (e) {
    return toActionError(e)
  }
}

// ===========================================================================
// updateProperty — ADMIN
// ===========================================================================
const UpdatePropertyInput = PropertyFields.extend({ id: zuuid() })
export type UpdatePropertyInput = z.input<typeof UpdatePropertyInput>

export async function updateProperty(
  input: UpdatePropertyInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { id, ...rest } = UpdatePropertyInput.parse(input)
    await requireAdmin()
    const admin = createAdminClient()

    const { error } = await admin.from('properties').update(toRow(rest)).eq('id', id)
    if (error) throw error

    revalidatePath('/admin/biens')
    revalidatePath(`/admin/biens/${id}`)
    return { ok: true, data: { id } }
  } catch (e) {
    return toActionError(e)
  }
}

// ===========================================================================
// registerPropertyPhoto — enregistre la métadonnée après upload Storage
// (le fichier est uploadé côté client sous {propertyId}/... par l'admin)
// ===========================================================================
const RegisterPhotoInput = z.object({
  propertyId: zuuid(),
  path: z.string().min(1).max(500),
})
export type RegisterPhotoInput = z.input<typeof RegisterPhotoInput>

export async function registerPropertyPhoto(
  input: RegisterPhotoInput,
): Promise<ActionResult<{ id: string; url: string | null; isCover: boolean }>> {
  try {
    const { propertyId, path } = RegisterPhotoInput.parse(input)

    // Cohérence : le chemin DOIT commencer par {propertyId}/ (convention Storage).
    if (!path.startsWith(`${propertyId}/`)) {
      return { ok: false, error: 'Chemin de fichier invalide.', code: 'bad_path' }
    }

    await requireAdmin()
    const admin = createAdminClient()

    // 1re photo => couverture par défaut ; sort_order = nb existant.
    const { count } = await admin
      .from('property_photos')
      .select('*', { count: 'exact', head: true })
      .eq('property_id', propertyId)
      .is('deleted_at', null)
    const existing = count ?? 0

    const { data: photo, error } = await admin
      .from('property_photos')
      .insert({
        property_id: propertyId,
        file_url: path,
        sort_order: existing,
        is_cover: existing === 0,
      })
      .select('id, is_cover')
      .single()
    if (error) throw error

    const { data: signed } = await admin.storage
      .from(PROPERTY_PHOTOS_BUCKET)
      .createSignedUrl(path, 60 * 60)

    revalidatePath(`/admin/biens/${propertyId}`)
    return {
      ok: true,
      data: { id: photo.id, url: signed?.signedUrl ?? null, isCover: photo.is_cover },
    }
  } catch (e) {
    return toActionError(e)
  }
}

// ===========================================================================
// setCoverPhoto — ADMIN
// ===========================================================================
const SetCoverInput = z.object({
  propertyId: zuuid(),
  photoId: zuuid(),
})

export async function setCoverPhoto(
  input: z.input<typeof SetCoverInput>,
): Promise<ActionResult<null>> {
  try {
    const { propertyId, photoId } = SetCoverInput.parse(input)
    await requireAdmin()
    const admin = createAdminClient()

    // Retire la couverture de toutes les photos du bien, puis la pose sur une.
    const { error: clearErr } = await admin
      .from('property_photos')
      .update({ is_cover: false })
      .eq('property_id', propertyId)
    if (clearErr) throw clearErr

    const { error: setErr } = await admin
      .from('property_photos')
      .update({ is_cover: true })
      .eq('id', photoId)
      .eq('property_id', propertyId)
    if (setErr) throw setErr

    revalidatePath(`/admin/biens/${propertyId}`)
    return { ok: true, data: null }
  } catch (e) {
    return toActionError(e)
  }
}

// ===========================================================================
// deletePropertyPhoto — ADMIN (supprime le fichier Storage + la ligne)
// ===========================================================================
const DeletePhotoInput = z.object({ photoId: zuuid() })

export async function deletePropertyPhoto(
  input: z.input<typeof DeletePhotoInput>,
): Promise<ActionResult<null>> {
  try {
    const { photoId } = DeletePhotoInput.parse(input)
    await requireAdmin()
    const admin = createAdminClient()

    const { data: row, error: getErr } = await admin
      .from('property_photos')
      .select('file_url, property_id, is_cover')
      .eq('id', photoId)
      .single()
    if (getErr) throw getErr

    await admin.storage.from(PROPERTY_PHOTOS_BUCKET).remove([row.file_url])
    const { error: delErr } = await admin.from('property_photos').delete().eq('id', photoId)
    if (delErr) throw delErr

    // Si c'était la couverture, promouvoir la première photo restante.
    if (row.is_cover) {
      const { data: next } = await admin
        .from('property_photos')
        .select('id')
        .eq('property_id', row.property_id)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (next) {
        await admin.from('property_photos').update({ is_cover: true }).eq('id', next.id)
      }
    }

    revalidatePath(`/admin/biens/${row.property_id}`)
    return { ok: true, data: null }
  } catch (e) {
    return toActionError(e)
  }
}
