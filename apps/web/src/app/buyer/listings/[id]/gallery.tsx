"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/components/ui";

export type GalleryPhoto = { id: string; full: string; thumb: string };

/** Main photo with thumbnails. Arrow keys and buttons move between photos. */
export function Gallery({ photos, title }: { photos: GalleryPhoto[]; title: string }) {
  const [i, setI] = useState(0);
  const n = photos.length;
  const go = (d: number) => setI((x) => (x + d + n) % n);
  const current = photos[i]!;

  return (
    <div
      className="space-y-2"
      role="region"
      aria-roledescription="gallery"
      aria-label={`Photos of ${title}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      <div className="relative overflow-hidden rounded-2xl bg-brand-900">
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized photo from storage */}
        <img src={current.full} alt={`${title}, photo ${i + 1} of ${n}`} className="aspect-[16/10] w-full object-contain" />
        {n > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow hover:bg-white"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow hover:bg-white"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white tabular-nums">
              {i + 1} / {n}
            </span>
          </>
        ) : null}
      </div>
      {n > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, k) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setI(k)}
              aria-label={`Show photo ${k + 1}`}
              aria-current={k === i ? "true" : undefined}
              className={cx(
                "shrink-0 overflow-hidden rounded-lg ring-2 transition",
                k === i ? "ring-brand-600" : "ring-transparent opacity-70 hover:opacity-100",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail */}
              <img src={p.thumb} alt="" loading="lazy" className="h-16 w-24 object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
