import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { pageWithToken } from "./facebook-pages";
import { FULL_EDGE, MAX_PHOTOS, MEDIA_BUCKET, THUMB_EDGE, photoPaths } from "./media";
import { isFacebookImageUrl, metaConfig, pagePost, postImageUrls } from "./meta";
import { createAdminClient } from "./supabase/admin";

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;

/** Download one image from Facebook's image hosts only, with size and type limits. */
export async function downloadFacebookImage(url: string, f: typeof fetch = fetch): Promise<Buffer | null> {
  if (!isFacebookImageUrl(url)) return null;
  const res = await f(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!res.ok || !res.body) return null;
  if (!(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
  if (Number(res.headers.get("content-length") ?? 0) > MAX_DOWNLOAD_BYTES) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_DOWNLOAD_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Re-encode as JPEG at the same sizes the browser uploader uses (also strips metadata). */
export async function toListingJpegs(input: Buffer) {
  const base = sharp(input, { limitInputPixels: 60_000_000, failOn: "error" }).rotate();
  const full = await base
    .clone()
    .resize(FULL_EDGE, FULL_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base
    .clone()
    .resize(THUMB_EDGE, THUMB_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true })
    .toBuffer();
  return { full: full.data, thumb, width: full.info.width, height: full.info.height };
}

/**
 * Copy the photos of a business's own Page post onto a new listing. Runs after
 * the response (after()), so it uses the service role; every step is scoped
 * to the business that owns both the Page and the listing.
 */
export async function copyPostPhotos(businessId: string, propertyId: string, pageRowId: string, postId: string) {
  const cfg = metaConfig();
  const admin = createAdminClient();
  const page = await pageWithToken(businessId, pageRowId);
  if (!cfg || !admin || !page) return;

  const { data: prop } = await admin.from("properties").select("id").eq("id", propertyId).eq("business_id", businessId).maybeSingle();
  if (!prop) return;

  const post = await pagePost(fetch, cfg, page.pageId, postId, page.token);
  const { count } = await admin.from("property_media").select("id", { count: "exact", head: true }).eq("property_id", propertyId);
  let order = count ?? 0;

  for (const url of postImageUrls(post, MAX_PHOTOS - order)) {
    try {
      const raw = await downloadFacebookImage(url);
      if (!raw) continue;
      const img = await toListingJpegs(raw);
      const paths = photoPaths(businessId, propertyId, randomUUID());
      const opts = { contentType: "image/jpeg", upsert: false };
      const [a, b] = await Promise.all([
        admin.storage.from(MEDIA_BUCKET).upload(paths.full, img.full, opts),
        admin.storage.from(MEDIA_BUCKET).upload(paths.thumb, img.thumb, opts),
      ]);
      if (a.error || b.error) {
        await admin.storage.from(MEDIA_BUCKET).remove([paths.full, paths.thumb]);
        continue;
      }
      const { error } = await admin.from("property_media").insert({
        business_id: businessId,
        property_id: propertyId,
        storage_path: paths.full,
        thumb_path: paths.thumb,
        kind: "photo",
        width: img.width,
        height: img.height,
        sort_order: order,
      });
      if (error) {
        await admin.storage.from(MEDIA_BUCKET).remove([paths.full, paths.thumb]);
        if (/at most/.test(error.message)) break;
        continue;
      }
      order++;
    } catch (e) {
      console.error("[meta] photo copy failed:", e instanceof Error ? e.message : String(e));
    }
  }
}
