import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Where a finished video ad waits while it is posted to Facebook. Private: the
 * browser uploads through a one-time signed link from the server, and Facebook
 * fetches through a short-lived one.
 */
export const VIDEO_BUCKET = "video-ads";
export const VIDEO_EXTS = ["mp4", "webm"] as const;
export type VideoExt = (typeof VIDEO_EXTS)[number];

/** One file per video ad, in its business's folder. Both parts are ids checked by the caller. */
export const videoUploadPath = (
  businessId: string,
  videoAdId: string,
  ext: VideoExt,
) => `${businessId}/${videoAdId}.${ext}`;

/** Delete uploads older than a day: by then Facebook has fetched the file or never will. Returns how many were removed. */
export async function clearOldVideoUploads(
  admin: SupabaseClient,
  olderThanMs = 24 * 3600 * 1000,
): Promise<number> {
  const bucket = admin.storage.from(VIDEO_BUCKET);
  const { data: folders } = await bucket.list("", { limit: 1000 });
  const cutoff = Date.now() - olderThanMs;
  const old: string[] = [];
  for (const folder of folders ?? []) {
    // A folder is listed without an id; anything else at the top level is not ours.
    if (folder.id) continue;
    const { data: files } = await bucket.list(folder.name, { limit: 1000 });
    for (const file of files ?? []) {
      if (
        file.id &&
        file.created_at &&
        new Date(file.created_at).getTime() < cutoff
      )
        old.push(`${folder.name}/${file.name}`);
    }
  }
  if (!old.length) return 0;
  const { error } = await bucket.remove(old);
  return error ? 0 : old.length;
}
