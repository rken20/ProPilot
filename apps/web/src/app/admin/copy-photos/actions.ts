"use server";

import { redirect } from "next/navigation";
import { MAX_PHOTO_BYTES, oldPhotoUrl, photoFiles } from "@/lib/photo-copy";
import { requireSuperAdmin } from "@/lib/superadmin";

/** Copies every photo the database refers to from the old project into this one. Safe to run again. */
export async function copyOldPhotos() {
  const { admin } = await requireSuperAdmin();
  const [{ data: media }, { data: people }] = await Promise.all([
    admin.from("property_media").select("storage_path, thumb_path").limit(5000),
    admin
      .from("profiles")
      .select("avatar_path")
      .not("avatar_path", "is", null)
      .limit(5000),
  ]);
  const { files, rejected } = photoFiles(media ?? [], people ?? []);
  let copied = 0;
  let already = 0;
  let failed = rejected;
  for (const file of files) {
    try {
      const res = await fetch(oldPhotoUrl(file), {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/"))
        throw new Error(`old copy answered ${res.status}`);
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES)
        throw new Error("unexpected size");
      const { error } = await admin.storage
        .from(file.bucket)
        .upload(file.path, bytes, { contentType: type, upsert: false });
      if (!error) copied++;
      else if (/exists|duplicate/i.test(error.message)) already++;
      else throw new Error(error.message);
    } catch (e) {
      failed++;
      console.error(
        "[copy-photos]",
        file.bucket,
        file.path,
        e instanceof Error ? e.message : e,
      );
    }
  }
  redirect(
    `/admin/copy-photos?total=${files.length + rejected}&copied=${copied}&already=${already}&failed=${failed}`,
  );
}
