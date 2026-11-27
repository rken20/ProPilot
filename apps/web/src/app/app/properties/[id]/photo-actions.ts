"use server";

import { appSay } from "@/lib/lang-server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { checkPhoto } from "@/lib/listing-check-jobs";
import { can } from "@propilot/shared";
import { requireBusiness } from "@/lib/auth";
import { MAX_PHOTOS, MEDIA_BUCKET, photoPaths } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

type PhotoInput = { id: string; width: number; height: number };

function refresh(propertyId: string) {
  revalidatePath(`/app/properties/${propertyId}`);
  revalidatePath("/app/properties");
  revalidatePath("/app");
  revalidatePath(`/l/${propertyId}`);
}

/** Record a photo the browser has just uploaded to storage. */
export async function addPhoto(propertyId: string, input: PhotoInput): Promise<{ error?: string }> {
  const say = await appSay();
  const biz = await requireBusiness();
  if (!can(biz.role, "property.create")) return { error: say("Your role can't add photos.", "Hindi pwedeng mag-add ng photos ang role mo.") };
  if (!/^[0-9a-f-]{36}$/i.test(input.id)) return { error: "Bad photo id." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("property_media")
    .select("sort_order")
    .eq("property_id", propertyId)
    .order("sort_order", { ascending: false });
  if ((existing?.length ?? 0) >= MAX_PHOTOS) return { error: say(`A property can have at most ${MAX_PHOTOS} photos.`, `Hanggang ${MAX_PHOTOS} photos lang ang pwede sa isang property.`) };

  const paths = photoPaths(biz.businessId, propertyId, input.id);
  const { error } = await supabase.from("property_media").insert({
    business_id: biz.businessId,
    property_id: propertyId,
    storage_path: paths.full,
    thumb_path: paths.thumb,
    kind: "photo",
    width: Math.round(input.width) || null,
    height: Math.round(input.height) || null,
    sort_order: (existing?.[0]?.sort_order ?? -1) + 1,
  });
  if (error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([paths.full, paths.thumb]);
    return { error: /at most/.test(error.message) ? error.message : say("Couldn't save the photo. Please try again.", "Hindi na-save ang photo. Paki-try ulit.") };
  }
  // Fingerprint the photo and see whether this listing's photos are on another seller's listing. Never blocks the upload.
  after(() => checkPhoto(propertyId, paths.full));
  refresh(propertyId);
  return {};
}

export async function makeCover(propertyId: string, mediaId: string) {
  const biz = await requireBusiness();
  if (!can(biz.role, "property.create")) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_media")
    .select("sort_order")
    .eq("property_id", propertyId)
    .order("sort_order")
    .limit(1);
  const first = data?.[0]?.sort_order ?? 0;
  await supabase.from("property_media").update({ sort_order: first - 1 }).eq("id", mediaId).eq("property_id", propertyId);
  refresh(propertyId);
}

export async function deletePhoto(propertyId: string, mediaId: string) {
  const biz = await requireBusiness();
  if (!can(biz.role, "property.create")) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_media")
    .delete()
    .eq("id", mediaId)
    .eq("property_id", propertyId)
    .select("storage_path, thumb_path");
  const row = data?.[0];
  if (row) {
    await supabase.storage.from(MEDIA_BUCKET).remove([row.storage_path, row.thumb_path].filter(Boolean) as string[]);
  }
  refresh(propertyId);
}
