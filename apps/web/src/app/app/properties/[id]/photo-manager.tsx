"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { cx } from "@/components/ui";
import { FULL_EDGE, MAX_INPUT_BYTES, MAX_PHOTOS, MEDIA_BUCKET, THUMB_EDGE, fitWithin, mediaUrl, photoPaths } from "@/lib/media";
import { createClient } from "@/lib/supabase/client";
import { addPhoto, deletePhoto, makeCover } from "./photo-actions";

export type Photo = { id: string; storage_path: string; thumb_path: string | null };

/** Decode an image (EXIF orientation applied) and re-encode it as a JPEG no larger than `edge`. */
async function resize(file: File, edge: number, quality: number) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width, height } = fitWithin(bitmap.width, bitmap.height, edge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("encode failed");
  return { blob, width, height };
}

export function PhotoManager({
  businessId,
  propertyId,
  photos,
  canEdit,
}: {
  businessId: string;
  propertyId: string;
  photos: Photo[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const room = MAX_PHOTOS - photos.length;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    const problems: string[] = [];
    if (list.length > room) problems.push(`Only ${room} more photo${room === 1 ? "" : "s"} fit. Extra files were skipped.`);
    const supabase = createClient();

    let done = 0;
    for (const file of list.slice(0, Math.max(0, room))) {
      setProgress(`Uploading ${done + 1} of ${Math.min(list.length, room)}…`);
      if (!file.type.startsWith("image/")) {
        problems.push(`${file.name} isn't a photo.`);
        continue;
      }
      if (file.size > MAX_INPUT_BYTES) {
        problems.push(`${file.name} is over 20 MB.`);
        continue;
      }
      try {
        const [full, thumb] = await Promise.all([resize(file, FULL_EDGE, 0.82), resize(file, THUMB_EDGE, 0.75)]);
        const id = crypto.randomUUID();
        const paths = photoPaths(businessId, propertyId, id);
        const opts = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
        const [a, b] = await Promise.all([
          supabase.storage.from(MEDIA_BUCKET).upload(paths.full, full.blob, opts),
          supabase.storage.from(MEDIA_BUCKET).upload(paths.thumb, thumb.blob, opts),
        ]);
        if (a.error || b.error) {
          await supabase.storage.from(MEDIA_BUCKET).remove([paths.full, paths.thumb]);
          problems.push(`${file.name} couldn't be uploaded. Check your connection and try again.`);
          continue;
        }
        const res = await addPhoto(propertyId, { id, width: full.width, height: full.height });
        if (res.error) problems.push(`${file.name}: ${res.error}`);
        else done++;
      } catch {
        problems.push(`${file.name} couldn't be read. Try a JPEG or PNG.`);
      }
    }
    setProgress(null);
    setErrors(problems);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-card)]" aria-label="Photos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Photos</h2>
          <p className="text-sm text-muted">
            {photos.length} of {MAX_PHOTOS}. The first photo is the cover buyers see in search.
          </p>
        </div>
        {canEdit && room > 0 ? (
          <label
            className={cx(
              "inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700",
              (progress || pending) && "pointer-events-none opacity-60",
            )}
          >
            <ImagePlus className="size-4" aria-hidden />
            {progress ?? "Add photos"}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              className="sr-only"
              disabled={Boolean(progress)}
              onChange={(e) => void upload(e.target.files)}
            />
          </label>
        ) : null}
      </div>

      {errors.length ? (
        <ul role="alert" className="mt-4 space-y-1 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      {photos.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line px-6 py-10 text-center">
          <ImagePlus className="mx-auto size-8 text-muted" aria-hidden />
          <p className="mt-3 font-medium">No photos yet</p>
          <p className="mt-1 text-sm text-muted">
            {canEdit ? "Add photos so buyers can see the property. Large photos are resized automatically." : "The owner or an admin can add photos."}
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p, i) => (
            <li key={p.id} className="group relative overflow-hidden rounded-xl border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element -- already resized; served from Supabase */}
              <img src={mediaUrl(p.thumb_path ?? p.storage_path) ?? ""} alt={`Photo ${i + 1}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              {i === 0 ? (
                <span className="absolute left-2 top-2 rounded-md bg-brand-900/85 px-2 py-0.5 text-xs font-semibold text-white">Cover</span>
              ) : null}
              {canEdit ? (
                <div className="absolute inset-x-2 bottom-2 flex justify-end gap-1.5">
                  {i > 0 ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => startTransition(() => makeCover(propertyId, p.id))}
                      className="inline-flex items-center gap-1 rounded-md bg-white/95 px-2 py-1 text-xs font-medium shadow-sm ring-1 ring-black/5 hover:bg-white"
                    >
                      <Star className="size-3.5" aria-hidden /> Make cover
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={pending}
                    aria-label={`Delete photo ${i + 1}`}
                    onClick={() => {
                      if (confirm("Delete this photo? This can't be undone.")) startTransition(() => deletePhoto(propertyId, p.id));
                    }}
                    className="grid size-7 place-items-center rounded-md bg-white/95 text-red-700 shadow-sm ring-1 ring-black/5 hover:bg-white"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
