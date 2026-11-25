/**
 * One-time move of stored photos from the old Supabase project to the current one.
 * Paths come from our own database rows, but they are still checked against the exact
 * shapes the app writes, and the source host is fixed, so nothing here can be pointed elsewhere.
 * Delete this file (and /admin/copy-photos) once the move is done.
 */

export const OLD_STORAGE_ORIGIN = "https://vesbaioyzzzpabcwhiyk.supabase.co";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SHAPES = {
  "property-media": new RegExp(`^${ID}/${ID}/${ID}(-thumb)?\\.(jpg|webp|png)$`),
  avatars: new RegExp(`^${ID}/${ID}\\.jpg$`),
} as const;

export type PhotoBucket = keyof typeof SHAPES;
export type PhotoFile = { bucket: PhotoBucket; path: string };

/** Whether a stored path has the exact shape the app writes for that bucket. */
export function isPhotoPath(bucket: PhotoBucket, path: string): boolean {
  return SHAPES[bucket].test(path);
}

/** The old project's public address for a photo. Throws for any path the app wouldn't write. */
export function oldPhotoUrl(file: PhotoFile): string {
  if (!isPhotoPath(file.bucket, file.path)) throw new Error("not a photo path");
  return `${OLD_STORAGE_ORIGIN}/storage/v1/object/public/${file.bucket}/${file.path}`;
}

/** Every photo the database refers to, once each, keeping only well-formed paths. */
export function photoFiles(
  media: Array<{ storage_path: string | null; thumb_path: string | null }>,
  avatars: Array<{ avatar_path: string | null }>,
): { files: PhotoFile[]; rejected: number } {
  const seen = new Set<string>();
  const files: PhotoFile[] = [];
  let rejected = 0;
  const add = (bucket: PhotoBucket, path: string | null) => {
    if (!path) return;
    const key = `${bucket}/${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (isPhotoPath(bucket, path)) files.push({ bucket, path });
    else rejected++;
  };
  for (const m of media) {
    add("property-media", m.storage_path);
    add("property-media", m.thumb_path);
  }
  for (const a of avatars) add("avatars", a.avatar_path);
  return { files, rejected };
}
