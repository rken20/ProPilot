"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, Plus, Share2, Sparkles, X } from "lucide-react";
import { Alert, Field, Input, Panel, Select, buttonClass, cx } from "@/components/ui";
import { drawFrame, timelineFor, type Photo, type RenderAd } from "@/lib/video-ad/draw";
import { ensureFonts, exportVideo, loadPhotos, type VideoFile } from "@/lib/video-ad/export";
import { LIMITS, MAX_LINES, SHAPES, SHAPE_IDS, TEMPLATES, TEMPLATE_IDS, cleanPlan, cleanText, type AdLanguage, type AdListing, type AdText, type ShapeId, type TemplateId } from "@/lib/video-ad/spec";
import type { startVideoAd, suggestAd } from "./actions";

export type VideoItem = { id: string; listing: AdListing; photos: string[] };

type Suggestion = { template: TemplateId; reason: string; byAi: boolean };
type Making =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "rendering"; progress: number }
  | { kind: "done"; url: string; name: string; file: VideoFile }
  | { kind: "error"; message: string };

const fileName = (name: string, shape: ShapeId, ext: string) =>
  `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "listing"
  }-${shape}.${ext}`;

export function VideoMaker({
  items,
  initialId,
  used,
  limit,
  language,
  suggest,
  begin,
}: {
  items: VideoItem[];
  initialId: string;
  used: number;
  limit: number | null;
  language: AdLanguage;
  /** Asks the AI for a template and text (a server action). */
  suggest: typeof suggestAd;
  /** Takes one video from the month's allowance (a server action). */
  begin: typeof startVideoAd;
}) {
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const first = byId.get(initialId) ?? items[0]!;
  const start = useMemo(() => cleanPlan(null, first.listing, first.photos.length, language), [first, language]);

  const [id, setId] = useState(first.id);
  const [shape, setShape] = useState<ShapeId>("vertical");
  const [template, setTemplate] = useState<TemplateId>(start.template);
  const [text, setText] = useState<AdText>(start.text);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  // The AI's suggestion for the first listing is asked for as soon as the page opens.
  const [planning, setPlanning] = useState(first.photos.length > 0);
  const [photos, setPhotos] = useState<{ id: string; list: Photo[] } | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [making, setMaking] = useState<Making>({ kind: "idle" });
  const [left, setLeft] = useState(limit === null ? null : Math.max(0, limit - used));

  const item = byId.get(id) ?? first;
  /** The listing on screen now, so a slow answer for an earlier one is ignored. */
  const current = useRef(id);
  /** True once the owner has changed the template or the words, so a late AI answer doesn't overwrite them. */
  const touched = useRef(false);
  /** The ad the allowance was last taken for: making the same one again (after a failed export, say) isn't counted twice. */
  const counted = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  /** Callers show "the AI is writing" first; this only waits for the answer and applies it. */
  const askAi = useCallback(async (listingId: string, force: boolean) => {
    // If the AI can't be reached, the ad keeps the text made from the listing's own facts.
    const res = await suggest(listingId).catch(() => ({ plan: undefined }));
    if (current.current !== listingId) return;
    setPlanning(false);
    if (!res.plan) return;
    setSuggestion({ template: res.plan.template, reason: res.plan.reason, byAi: res.plan.byAi });
    if (force || !touched.current) {
      setTemplate(res.plan.template);
      setText(res.plan.text);
      touched.current = false;
    }
  }, [suggest]);

  const loadFor = useCallback(async (target: VideoItem) => {
    const list = target.photos.length ? await loadPhotos(target.photos) : [];
    if (current.current !== target.id) return;
    setPhotos({ id: target.id, list });
    setPhotoError(target.photos.length > 0 && list.length === 0);
  }, []);

  // First load: fonts for the canvas, the first listing's photos, and the AI's suggestion for it.
  useEffect(() => {
    // Each of these waits for something outside React (fonts, photos, the AI) and sets state when it arrives.
    void ensureFonts().then(() => setFontsReady(true));
    void Promise.resolve().then(() => loadFor(first));
    if (first.photos.length) void Promise.resolve().then(() => askAi(first.id, false));
    return () => abort.current?.abort();
    // Runs once: later listings are loaded by choose().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Free a listing's photos when another listing's replace them.
  useEffect(() => () => photos?.list.forEach((p) => (p as ImageBitmap).close?.()), [photos]);
  // And the finished file's address when it's replaced or the page is left.
  useEffect(
    () => () => {
      if (making.kind === "done") URL.revokeObjectURL(making.url);
    },
    [making],
  );

  function choose(nextId: string) {
    const next = byId.get(nextId);
    if (!next || nextId === id) return;
    abort.current?.abort();
    current.current = nextId;
    touched.current = false;
    const plan = cleanPlan(null, next.listing, next.photos.length, language);
    setId(nextId);
    setTemplate(plan.template);
    setText(plan.text);
    setSuggestion(null);
    setPlanning(next.photos.length > 0);
    setPhotoError(false);
    setPhotos(null);
    setMaking({ kind: "idle" });
    void loadFor(next);
    if (next.photos.length) void askAi(nextId, false);
  }

  const edit = (change: (t: AdText) => AdText) => {
    touched.current = true;
    setText(change);
    if (making.kind === "done" || making.kind === "error") setMaking({ kind: "idle" });
  };

  const ready = photos?.id === id && photos.list.length > 0 && fontsReady;
  const ad = useMemo<RenderAd | null>(
    () => (ready && photos ? { template, shape, listing: item.listing, text: cleanText(text), photos: photos.list } : null),
    [ready, photos, template, shape, item.listing, text],
  );
  const timeline = useMemo(() => (ad ? timelineFor(ad) : null), [ad]);
  const busy = making.kind === "starting" || making.kind === "rendering";

  // The live preview: the same drawing code that makes the file.
  const canvas = useRef<HTMLCanvasElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const clock = useRef({ t: 0, last: 0 });
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !ad || !timeline || busy) return;
    let raf = 0;
    clock.current.last = performance.now();
    const frame = (now: number) => {
      const c = clock.current;
      if (playing) c.t = (c.t + (now - c.last) / 1000) % timeline.duration;
      c.last = now;
      drawFrame(ctx, ad, timeline, Math.min(c.t, timeline.duration - 0.01));
      if (bar.current) bar.current.style.width = `${(c.t / timeline.duration) * 100}%`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ad, timeline, playing, busy]);

  async function make() {
    if (!ad || busy) return;
    const clean = cleanText(text);
    if (clean.hook.length < 3) return setMaking({ kind: "error", message: "Write a headline for the ad first." });
    setMaking({ kind: "starting" });
    const key = JSON.stringify([id, template, shape, clean]);
    if (counted.current !== key) {
      const res = await begin(id, template, shape, clean).catch(() => ({ ok: undefined, left: undefined, error: "Couldn't reach the server. Check your connection and try again." }));
      if (res.error || !res.ok) return setMaking({ kind: "error", message: res.error ?? "Couldn't start the video. Please try again." });
      counted.current = key;
      if (res.left !== undefined) setLeft(res.left);
    }
    abort.current = new AbortController();
    setMaking({ kind: "rendering", progress: 0 });
    try {
      const file = await exportVideo({ ...ad, text: clean }, (progress) => setMaking({ kind: "rendering", progress }), abort.current.signal);
      setMaking({ kind: "done", url: URL.createObjectURL(file.blob), name: fileName(item.listing.name, shape, file.ext), file });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return setMaking({ kind: "idle" });
      setMaking({
        kind: "error",
        message: "The video couldn't be made on this device. It wasn't counted again, so you can press Make the video once more, or try in Chrome on a computer.",
      });
    }
  }

  async function share() {
    if (making.kind !== "done") return;
    const file = new File([making.file.blob], making.name, { type: making.file.blob.type });
    try {
      await navigator.share({ files: [file], title: item.listing.name });
    } catch {
      // Closed the share sheet: nothing to do.
    }
  }
  const canShare =
    making.kind === "done" &&
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [new File([making.file.blob], making.name, { type: making.file.blob.type })] });

  const size = SHAPES[shape];
  const pickTemplate = (t: TemplateId) => {
    touched.current = true;
    setTemplate(t);
    clock.current.t = 0;
    if (making.kind === "done" || making.kind === "error") setMaking({ kind: "idle" });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <Panel title="Listing" className="lg:col-start-1">
        <Field label="Which listing is the ad for?" htmlFor="video-listing" hint="Only listings that are available or reserved are shown.">
          <Select id="video-listing" value={id} onChange={(e) => choose(e.target.value)} disabled={busy}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.listing.name} ({i.photos.length} {i.photos.length === 1 ? "photo" : "photos"})
              </option>
            ))}
          </Select>
        </Field>
        {item.photos.length === 0 ? (
          <div className="mt-3">
            <Alert tone="info">
              This listing has no photos yet. A video ad is made from its photos.{" "}
              <Link href={`/app/properties/${item.id}`} className="font-bold text-grape-700 hover:underline">
                Add photos
              </Link>
            </Alert>
          </div>
        ) : item.photos.length < 3 ? (
          <p className="mt-3 text-sm text-muted">With {item.photos.length === 1 ? "one photo" : "two photos"} the ad repeats them. Three or more photos make a better video.</p>
        ) : null}
      </Panel>

      <Panel title="Preview" className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="mx-auto grid place-items-center overflow-hidden rounded-2xl bg-[#0b1020]" style={{ aspectRatio: `${size.width} / ${size.height}`, maxHeight: "30rem", maxWidth: "100%" }}>
          {ad ? (
            <canvas ref={canvas} width={size.width} height={size.height} className="size-full" aria-label={`Preview of the video ad for ${item.listing.name}`} />
          ) : (
            <p className="p-6 text-center text-sm text-white/80">{photoError ? "The photos couldn't be loaded. Check your connection and reload." : item.photos.length ? "Loading the photos…" : "No photos to show."}</p>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            disabled={!ad || busy}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-grape-50 text-grape-700 hover:bg-grape-100 disabled:opacity-50"
            aria-label={playing ? "Pause the preview" : "Play the preview"}
          >
            {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          </button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-grape-50" aria-hidden>
            <div ref={bar} className="h-full w-0 rounded-full bg-grape-600" />
          </div>
          <span className="shrink-0 text-xs text-muted tabular-nums">{timeline ? `${Math.round(timeline.duration)} sec` : ""}</span>
        </div>

        <div className="mt-5 border-t border-line pt-5">
          {making.kind === "rendering" ? (
            <div role="status">
              <p className="text-sm font-semibold">Making your video… {Math.round(making.progress * 100)}%</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-grape-50">
                <div className="h-full rounded-full bg-grape-600 transition-[width]" style={{ width: `${Math.round(making.progress * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">Keep this page open. It&apos;s made on your device, so nothing is uploaded.</p>
              <button type="button" onClick={() => abort.current?.abort()} className={cx(buttonClass("secondary"), "mt-3")}>
                Cancel
              </button>
            </div>
          ) : making.kind === "done" ? (
            <div>
              <Alert tone="success">
                Your video is ready: {Math.round(making.file.seconds)} seconds, {(making.file.blob.size / 1_000_000).toFixed(1)} MB.
              </Alert>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={making.url} download={making.name} className={buttonClass("primary")}>
                  <Download className="size-4" aria-hidden /> Download
                </a>
                {canShare ? (
                  <button type="button" onClick={() => void share()} className={buttonClass("secondary")}>
                    <Share2 className="size-4" aria-hidden /> Share
                  </button>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-muted">
                The video has no sound. Add music when you post it: Facebook, TikTok and Instagram offer songs you&apos;re allowed to use.
              </p>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => void make()} disabled={!ad || busy || left === 0} className={cx(buttonClass("sun"), "w-full")}>
                {making.kind === "starting" ? "Starting…" : "Make the Video"}
              </button>
              <p className="mt-2 text-center text-xs text-muted tabular-nums">
                {left === null ? "Unlimited video ads on your plan." : left === 0 ? `All ${limit} video ads made this month. They renew on the 1st.` : `${left} of ${limit} video ads left this month.`}
              </p>
            </>
          )}
          {making.kind === "error" ? (
            <div className="mt-3">
              <Alert>{making.message}</Alert>
            </div>
          ) : null}
        </div>
      </Panel>

      <div className="space-y-6 lg:col-start-1">
        <Panel title="Shape">
          <div role="radiogroup" aria-label="Video shape" className="mt-1 grid grid-cols-3 gap-2">
            {SHAPE_IDS.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={shape === s}
                disabled={busy}
                onClick={() => {
                  setShape(s);
                  if (making.kind === "done" || making.kind === "error") setMaking({ kind: "idle" });
                }}
                className={cx(
                  "rounded-2xl border-2 p-3 text-left transition-colors",
                  shape === s ? "border-grape-600 bg-grape-50" : "border-line bg-white hover:border-grape-300",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cx("block rounded-[3px] border-2", shape === s ? "border-grape-700 bg-grape-100" : "border-muted/60")}
                    style={{ width: `${(SHAPES[s].width / Math.max(SHAPES[s].width, SHAPES[s].height)) * 22}px`, height: `${(SHAPES[s].height / Math.max(SHAPES[s].width, SHAPES[s].height)) * 22}px` }}
                    aria-hidden
                  />
                  <span className="text-sm font-bold">{SHAPES[s].label}</span>
                </span>
                <span className="mt-1 block text-xs text-muted">{SHAPES[s].use}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Template">
          <p className="mt-1 text-sm text-muted" role="status">
            {planning
              ? "The AI is choosing a template and writing the text…"
              : suggestion?.byAi
                ? `The AI suggests ${TEMPLATES[suggestion.template].label}${suggestion.reason ? `: ${suggestion.reason}` : "."}`
                : "Pick the look of the ad. You can change it any time before making the video."}
          </p>
          <div role="radiogroup" aria-label="Template" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TEMPLATE_IDS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={template === t}
                disabled={busy}
                onClick={() => pickTemplate(t)}
                className={cx("rounded-2xl border-2 p-3 text-left transition-colors", template === t ? "border-grape-600 bg-grape-50" : "border-line bg-white hover:border-grape-300")}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{TEMPLATES[t].label}</span>
                  {suggestion?.byAi && suggestion.template === t ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sun px-2 py-0.5 text-[11px] font-bold text-sun-ink">
                      <Sparkles className="size-3" aria-hidden /> AI pick
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs text-ink/75">{TEMPLATES[t].about}</span>
                <span className="mt-1 block text-xs text-muted">Best for: {TEMPLATES[t].bestFor.toLowerCase()}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Text">
          <p className="mt-1 text-sm text-muted">
            Every word is yours to change. The price, location, financing and your business name come from the listing and are added for you.
          </p>
          <div className="mt-4 space-y-4">
            <Field label="Headline" htmlFor="video-hook" hint="The first thing people read. Say what it is and where.">
              <Input id="video-hook" value={text.hook} maxLength={LIMITS.hook} disabled={busy} onChange={(e) => edit((t) => ({ ...t, hook: e.target.value }))} />
            </Field>
            <fieldset>
              <legend className="text-sm font-medium text-ink">Feature lines</legend>
              <p className="mt-0.5 text-xs text-muted">One short feature each. They appear one at a time over the photos.</p>
              <ul className="mt-2 space-y-2">
                {text.lines.map((line, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Input
                      value={line}
                      maxLength={LIMITS.line}
                      disabled={busy}
                      aria-label={`Feature line ${i + 1}`}
                      onChange={(e) => edit((t) => ({ ...t, lines: t.lines.map((l, k) => (k === i ? e.target.value : l)) }))}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => edit((t) => ({ ...t, lines: t.lines.filter((_, k) => k !== i) }))}
                      className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-grape-50 hover:text-ink"
                      aria-label={`Remove feature line ${i + 1}`}
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              {text.lines.length < MAX_LINES ? (
                <button type="button" disabled={busy} onClick={() => edit((t) => ({ ...t, lines: [...t.lines, ""] }))} className={cx(buttonClass("ghost"), "mt-2")}>
                  <Plus className="size-4" aria-hidden /> Add a line
                </button>
              ) : null}
            </fieldset>
            <Field label="Call to action" htmlFor="video-cta" hint="What should the viewer do next?">
              <Input id="video-cta" value={text.cta} maxLength={LIMITS.cta} disabled={busy} onChange={(e) => edit((t) => ({ ...t, cta: e.target.value }))} />
            </Field>
            {item.photos.length ? (
              <button type="button" disabled={busy || planning} onClick={() => {
                  setPlanning(true);
                  void askAi(id, true);
                }}
                className={buttonClass("secondary")}
              >
                <Sparkles className="size-4" aria-hidden /> {planning ? "Writing…" : "Let the AI write it again"}
              </button>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}
