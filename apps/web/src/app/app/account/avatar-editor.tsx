"use client";

import { useSay } from "@/components/lang";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Alert, buttonClass, cx } from "@/components/ui";
import {
  AVATAR_BUCKET,
  AVATAR_EDGE,
  MAX_INPUT_BYTES,
  avatarPath,
  squareCrop,
} from "@/lib/media";
import { createClient } from "@/lib/supabase/client";
import { removeAvatar, setAvatar } from "./avatar-actions";

/** Crop the middle square of a photo (orientation applied) to a small JPEG. Re-encoding also drops the photo's location and camera details. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const { sx, sy, size } = squareCrop(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_EDGE;
  canvas.height = AVATAR_EDGE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, AVATAR_EDGE, AVATAR_EDGE);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.86),
  );
  if (!blob) throw new Error("encode failed");
  return blob;
}

export function AvatarEditor({
  userId,
  name,
  url,
}: {
  userId: string;
  name: string;
  url: string | null;
}) {
  const say = useSay();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const shown = preview ?? url;

  async function pick(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/"))
      return setError(say("That file isn't a photo. Choose a JPG or PNG.", "Hindi photo ang file na iyan. Pumili ng JPG o PNG."));
    if (file.size > MAX_INPUT_BYTES)
      return setError(say("That photo is over 20 MB. Choose a smaller one.", "Lampas 20 MB ang photo na iyan. Pumili ng mas maliit."));
    setBusy("Uploading…");
    try {
      const blob = await toSquareJpeg(file);
      const id = crypto.randomUUID();
      const { error: upErr } = await createClient()
        .storage.from(AVATAR_BUCKET)
        .upload(avatarPath(userId, id), blob, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false,
        });
      if (upErr) throw upErr;
      const res = await setAvatar(id);
      if (res.error) return setError(res.error);
      setPreview(URL.createObjectURL(blob));
      startTransition(() => router.refresh());
    } catch {
      setError(say("Couldn't upload the photo. Please try another one.", "Hindi na-upload ang photo. Paki-try ang iba."));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setError(null);
    setBusy("Removing…");
    await removeAvatar();
    setPreview(null);
    setBusy(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={Boolean(busy)}
        className="group relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-grape-600"
        aria-label={shown ? "Change your profile photo" : "Add a profile photo"}
      >
        <Avatar
          name={name}
          url={shown}
          className="size-24 bg-grape-100 text-2xl text-grape-700"
        />
        <span className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full border-2 border-white bg-grape-700 text-white transition-transform group-hover:scale-110">
          <Camera className="size-4" aria-hidden />
        </span>
      </button>
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-semibold">Profile photo</p>
        <p className="mt-0.5 text-sm text-muted">
          {say("Your team sees it beside your name. A clear photo of your face works best.", "Makikita ito ng team mo sa tabi ng pangalan mo. Mas maganda kung malinaw na photo ng mukha mo.")}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={Boolean(busy)}
            className={cx(buttonClass("secondary"), "min-h-10")}
          >
            {busy ?? (shown ? "Change photo" : "Upload photo")}
          </button>
          {shown && !busy ? (
            <button
              type="button"
              onClick={() => void remove()}
              className="min-h-10 text-sm font-semibold text-hot hover:underline"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {error ? (
        <div className="w-full">
          <Alert>{error}</Alert>
        </div>
      ) : null}
    </div>
  );
}
