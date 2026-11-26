"use client";

import { useSay } from "@/components/lang";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, Pause, Play, RefreshCw, Send, Share2, Sparkles, Volume2, VolumeX } from "lucide-react";
import { Alert, Field, Panel, Select, buttonClass, cx } from "@/components/ui";
import { drawFrame, timelineFor, type Photo, type RenderAd } from "@/lib/video-ad/draw";
import { createClient } from "@/lib/supabase/client";
import { PreviewSound, renderSoundtrack } from "@/lib/video-ad/audio";
import { videoCaption } from "@/lib/video-ad/caption";
import { ensureFonts, exportVideo, loadPhotos, type VideoFile } from "@/lib/video-ad/export";
import type { AdPlan } from "@/lib/video-ad/plan";
import { MUSIC, MUSIC_FOR, musicShape, soundCues } from "@/lib/video-ad/sound";
import { SHAPES, SHAPE_IDS, TEMPLATES, TEMPLATE_IDS, adFor, cleanPlan, cleanText, type AdLanguage, type AdListing, type ShapeId, type TemplateId } from "@/lib/video-ad/spec";
import type { postVideoAd, prepareVideoPost, startVideoAd, suggestAd } from "./actions";

/** A listing to make an ad for. `thumbs` are small versions of `photos`, in the same order. */
export type VideoItem = { id: string; listing: AdListing; photos: string[]; thumbs: string[]; /** The listing's public page, if it has one. */ link: string | null };

/** Posting a finished video to the business's Facebook Page. */
export type FacebookPosting = {
  /** Connected Pages this person may post to. */
  pages: Array<{ id: string; name: string }>;
  /** Whether the business has connected any Page at all. */
  connected: boolean;
  /** Whether this person's role may post. */
  mayPost: boolean;
  prepare: typeof prepareVideoPost;
  post: typeof postVideoAd;
};

type Posting = { kind: "idle" } | { kind: "uploading" } | { kind: "posting" } | { kind: "done"; page: string; link?: string } | { kind: "error"; message: string };

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

/** The ad made from the listing's own facts: what shows until the AI answers, and if it can't be reached. */
function localPlan(item: VideoItem, language: AdLanguage): AdPlan {
  const plan = cleanPlan(null, item.listing, item.photos.length, language);
  return { ...plan, music: MUSIC_FOR[plan.template], byAi: false, sawPhotos: false };
}

/** How much smaller a template's still is than the video. */
const STILL = 3;

/** One frame of the ad in a template, drawn from the listing's own photos, so a look is chosen by seeing it. */
function Still({ ad }: { ad: RenderAd }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = SHAPES[ad.shape];
  useEffect(() => {
    const out = ref.current?.getContext("2d");
    if (!out) return;
    // Drawn at the video's own size, then shrunk, so it is exactly what the video shows.
    const full = document.createElement("canvas");
    full.width = size.width;
    full.height = size.height;
    const ctx = full.getContext("2d");
    if (!ctx) return;
    const timeline = timelineFor(ad);
    const clip = timeline.scenes.find((sc) => sc.kind === "photo" && sc.line) ?? timeline.scenes[0]!;
    drawFrame(ctx, ad, timeline, clip.start + (clip.end - clip.start) * 0.7);
    out.imageSmoothingQuality = "high";
    out.drawImage(full, 0, 0, out.canvas.width, out.canvas.height);
    full.width = 0;
  }, [ad, size]);
  return <canvas ref={ref} width={Math.round(size.width / STILL)} height={Math.round(size.height / STILL)} className="block w-full" aria-hidden />;
}

export function VideoMaker({
  items,
  initialId,
  used,
  limit,
  language,
  suggest,
  begin,
  facebook,
}: {
  items: VideoItem[];
  initialId: string;
  used: number;
  limit: number | null;
  language: AdLanguage;
  /** Asks the AI to make the ad: template, music, words and photo order (a server action). */
  suggest: typeof suggestAd;
  /** Takes one video from the month's allowance (a server action). */
  begin: typeof startVideoAd;
  facebook: FacebookPosting;
}) {
  const say = useSay();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const first = byId.get(initialId) ?? items[0]!;
  const start = useMemo(() => localPlan(first, language), [first, language]);

  const [id, setId] = useState(first.id);
  const [shape, setShape] = useState<ShapeId>("vertical");
  /** The ad as the AI made it. The owner doesn't edit it: they pick a look and keep it or ask for another. */
  const [plan, setPlan] = useState<AdPlan>(start);
  const [template, setTemplate] = useState<TemplateId>(start.template);
  /** The look the AI chose for this listing, and why. Later versions are written for the look on screen, which may be the owner's choice. */
  const [aiPick, setAiPick] = useState<{ template: TemplateId; reason: string } | null>(null);
  /** Which spare opening to use, when another version is asked for and the AI can't be reached. */
  const [turn, setTurn] = useState(0);
  // The AI starts on the first listing's ad as soon as the page opens.
  const [planning, setPlanning] = useState<"first" | "another" | null>(first.photos.length > 0 ? "first" : null);
  const [photos, setPhotos] = useState<{ id: string; list: Photo[] } | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [making, setMaking] = useState<Making>({ kind: "idle" });
  const [left, setLeft] = useState(limit === null ? null : Math.max(0, limit - used));
  /** The record of the video that was made last, which a post to Facebook is tied to. */
  const [adId, setAdId] = useState<string | null>(null);
  const [posting, setPosting] = useState<Posting>({ kind: "idle" });
  const [pageId, setPageId] = useState(facebook.pages[0]?.id ?? "");
  /** Whether the preview plays its sound. Off until pressed: browsers only allow sound after a tap. */
  const [hear, setHear] = useState(false);
  const [track, setTrack] = useState<{ key: string; buffer: AudioBuffer | null } | null>(null);
  const preview = useRef<PreviewSound | null>(null);

  const item = byId.get(id) ?? first;
  /** The listing on screen now, so a slow answer for an earlier one is ignored. */
  const current = useRef(id);
  /** True once the owner has picked a template themselves, so the AI's own pick doesn't replace it. */
  const picked = useRef(false);
  /** How many versions of this listing's ad the owner has seen and passed on. */
  const take = useRef(0);
  /** The ad the allowance was last taken for: making the same one again (after a failed export, say) isn't counted twice. */
  const counted = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const canvas = useRef<HTMLCanvasElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  /** Where the preview is, in seconds into the ad. */
  const clock = useRef({ t: 0, last: 0 });
  /** Back to the start of the ad, picture and sound together. */
  const rewind = useCallback(() => {
    clock.current.t = 0;
    preview.current?.seek(0);
  }, []);

  /** Callers show "the AI is making it" first; this waits for the answer and puts it on screen. */
  const askAi = useCallback(
    async (listingId: string, ask: { template?: TemplateId; take?: number }) => {
      const res = await suggest(listingId, ask).catch(() => ({ plan: undefined }));
      if (current.current !== listingId) return;
      setPlanning(null);
      if (res.plan?.byAi) {
        setPlan(res.plan);
        setTurn(0);
        if (!ask.template) setAiPick({ template: res.plan.template, reason: res.plan.reason });
        if (!picked.current) setTemplate(res.plan.template);
        rewind();
      } else if (ask.take) {
        // The AI couldn't be reached: the ad keeps its words from the listing's own facts, with a different opening.
        setTurn((t) => t + 1);
        rewind();
      }
    },
    [suggest, rewind],
  );

  const loadFor = useCallback(async (target: VideoItem) => {
    const list = target.photos.length ? await loadPhotos(target.photos) : [];
    if (current.current !== target.id) return;
    setPhotos({ id: target.id, list });
    setPhotoError(target.photos.length > 0 && list.length === 0);
  }, []);

  // First load: fonts for the canvas, the first listing's photos, and the AI's ad for it.
  useEffect(() => {
    // Each of these waits for something outside React (fonts, photos, the AI) and sets state when it arrives.
    void ensureFonts().then(() => setFontsReady(true));
    void Promise.resolve().then(() => loadFor(first));
    if (first.photos.length) void Promise.resolve().then(() => askAi(first.id, {}));
    return () => {
      abort.current?.abort();
      preview.current?.close();
    };
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

  /** A finished video is for the ad as it was: any change brings the Make button back. */
  const changed = () => {
    if (making.kind === "done" || making.kind === "error") setMaking({ kind: "idle" });
    setPosting({ kind: "idle" });
  };

  function choose(nextId: string) {
    const next = byId.get(nextId);
    if (!next || nextId === id) return;
    abort.current?.abort();
    current.current = nextId;
    picked.current = false;
    take.current = 0;
    const local = localPlan(next, language);
    setId(nextId);
    setPlan(local);
    setTemplate(local.template);
    setAiPick(null);
    setTurn(0);
    setPlanning(next.photos.length > 0 ? "first" : null);
    setPhotoError(false);
    setPhotos(null);
    setMaking({ kind: "idle" });
    rewind();
    if (bar.current) bar.current.style.width = "0%";
    void loadFor(next);
    if (next.photos.length) void askAi(nextId, {});
  }

  function pickTemplate(t: TemplateId) {
    if (t === template) return;
    picked.current = true;
    setTemplate(t);
    rewind();
    changed();
  }

  /** "I don't like this one": the AI makes the ad again, differently, in the look on screen. */
  function another() {
    if (planning || !item.photos.length) return;
    take.current += 1;
    changed();
    setPlanning("another");
    void askAi(id, { template, take: take.current });
  }

  const ready = photos?.id === id && photos.list.length > 0 && fontsReady;
  /** The ad in each template, from the same plan: the stills show them all, the preview plays the chosen one. */
  const ads = useMemo(() => {
    if (!ready || !photos) return null;
    return Object.fromEntries(
      TEMPLATE_IDS.map((t) => {
        const fit = adFor(t, plan, turn);
        return [t, { template: t, shape, listing: item.listing, text: cleanText(fit.text), photos: photos.list, picks: fit.photos } satisfies RenderAd];
      }),
    ) as Record<TemplateId, RenderAd>;
  }, [ready, photos, plan, turn, shape, item.listing]);
  const ad = ads?.[template] ?? null;
  const timeline = useMemo(() => (ad ? timelineFor(ad) : null), [ad]);
  const busy = making.kind === "starting" || making.kind === "rendering";

  // The soundtrack: the AI's music for the look it chose (each other look brings its own), and the sound effects, made on the device.
  const music = plan.byAi && plan.template === template ? plan.music : MUSIC_FOR[template];
  const cues = useMemo(() => (timeline ? soundCues(template, timeline) : []), [template, timeline]);
  const soundKey = timeline ? JSON.stringify([music, musicShape(timeline), cues]) : "";
  const soundFor = useCallback(() => (timeline ? renderSoundtrack({ shape: musicShape(timeline), music, cues, effects: true }) : Promise.resolve(null)), [timeline, music, cues]);

  // Make the preview's sound when it's switched on, and again when the ad changes.
  useEffect(() => {
    if (!hear || !timeline || busy || track?.key === soundKey) return;
    let live = true;
    const timer = setTimeout(() => {
      void soundFor()
        .catch(() => null)
        .then((buffer) => live && setTrack({ key: soundKey, buffer }));
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [hear, timeline, busy, track, soundKey, soundFor]);

  // Play it along with the picture.
  useEffect(() => {
    const player = preview.current;
    if (!player) return;
    if (!hear || !playing || busy || !track?.buffer || track.key !== soundKey) return player.stop();
    player.play(track.buffer, clock.current.t);
    return () => player.stop();
  }, [hear, playing, busy, track, soundKey]);

  async function toggleSound() {
    if (hear) return setHear(false);
    preview.current ??= new PreviewSound();
    if (await preview.current.unlock()) {
      setHear(true);
      setPlaying(true);
    }
  }

  // The live preview: the same drawing code that makes the file.
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !ad || !timeline || busy) return;
    let raf = 0;
    clock.current.last = performance.now();
    const frame = (now: number) => {
      const c = clock.current;
      // While the sound plays, the picture follows it; otherwise the page's own clock.
      const heard = preview.current?.time() ?? null;
      if (heard !== null) c.t = heard % timeline.duration;
      else if (playing) c.t = (c.t + (now - c.last) / 1000) % timeline.duration;
      c.last = now;
      drawFrame(ctx, ad, timeline, Math.min(c.t, timeline.duration - 0.01));
      if (bar.current) bar.current.style.width = `${(c.t / timeline.duration) * 100}%`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ad, timeline, playing, busy]);

  async function make() {
    if (!ad || busy || planning) return;
    setMaking({ kind: "starting" });
    const key = JSON.stringify([id, template, shape, ad.text, ad.picks]);
    if (counted.current !== key) {
      const res = await begin(id, template, shape, ad.text).catch(() => ({ ok: undefined, left: undefined, error: say("Couldn't reach the server. Check your connection and try again.", "Hindi maabot ang server. I-check ang connection mo at subukan ulit.") }));
      if (res.error || !res.ok) return setMaking({ kind: "error", message: res.error ?? "Couldn't start the video. Please try again." });
      counted.current = key;
      setAdId(res.id ?? null);
      setPosting({ kind: "idle" });
      if (res.left !== undefined) setLeft(res.left);
    }
    abort.current = new AbortController();
    setMaking({ kind: "rendering", progress: 0 });
    try {
      // The sound is made first, in a fraction of a second; if it fails the video is made silent rather than not at all.
      const sound = track?.key === soundKey ? track.buffer : await soundFor().catch(() => null);
      const file = await exportVideo(ad, sound, (progress) => setMaking({ kind: "rendering", progress }), abort.current.signal);
      setMaking({ kind: "done", url: URL.createObjectURL(file.blob), name: fileName(item.listing.name, shape, file.ext), file });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return setMaking({ kind: "idle" });
      setMaking({
        kind: "error",
        message: say("The video couldn't be made on this device. It wasn't counted again, so you can press Make the Video once more, or try in Chrome on a computer.", "Hindi nagawa ang video sa device na ito. Hindi ito binilang ulit, kaya pwede mong pindutin ulit ang Make the Video, o subukan sa Chrome sa computer."),
      });
    }
  }

  /** The owner pressed Post: only now does the video leave the device, to go to their Facebook Page. */
  async function postToPage() {
    if (making.kind !== "done" || !adId || !pageId || posting.kind === "uploading" || posting.kind === "posting") return;
    const offline = say("Couldn't reach the server. Check your connection and try again.", "Hindi maabot ang server. I-check ang connection mo at subukan ulit.");
    const { blob, ext } = making.file;
    setPosting({ kind: "uploading" });
    const link = await facebook.prepare(adId, ext).catch(() => ({ bucket: undefined, path: undefined, token: undefined, error: offline }));
    if (link.error || !link.bucket || !link.path || !link.token) return setPosting({ kind: "error", message: link.error ?? offline });
    const sent = await createClient()
      .storage.from(link.bucket)
      .uploadToSignedUrl(link.path, link.token, blob, { contentType: `video/${ext}`, upsert: true })
      .catch(() => ({ error: true }));
    if (sent.error) return setPosting({ kind: "error", message: say("The video couldn't be uploaded. Check your connection and try again.", "Hindi na-upload ang video. I-check ang connection mo at subukan ulit.") });
    setPosting({ kind: "posting" });
    const res = await facebook.post(adId, ext, pageId).catch(() => ({ postedTo: undefined, link: undefined, error: offline }));
    if (res.error || !res.postedTo) return setPosting({ kind: "error", message: res.error ?? offline });
    setPosting({ kind: "done", page: res.postedTo, link: res.link });
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

  // On a phone the looks are a strip that scrolls sideways: keep the chosen one in view, without moving the page.
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = strip.current;
    const chosen = box?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!box || !chosen || box.scrollWidth <= box.clientWidth) return;
    const left = chosen.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft || left + chosen.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: left - 8, behavior: "smooth" });
  }, [template]);

  const size = SHAPES[shape];
  const anotherButton = (
    <button type="button" onClick={another} disabled={!ad || busy || planning !== null} className={cx(buttonClass("secondary"), "w-full")}>
      <RefreshCw className={cx("size-4", planning === "another" && "animate-spin motion-reduce:animate-none")} aria-hidden />
      {planning === "another" ? "Making another…" : "Show Me Another Version"}
    </button>
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="min-w-0 space-y-6 lg:col-start-1">
        <Panel title="Listing">
          <Field label="Which listing is the ad for?" htmlFor="video-listing" hint={say("Only listings that are available or reserved are shown.", "Available o reserved na listings lang ang ipinapakita.")}>
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
                {say("This listing has no photos yet. A video ad is made from its photos.", "Wala pang photos ang listing na ito. Ginagawa ang video ad mula sa photos nito.")}{" "}
                <Link href={`/app/properties/${item.id}`} className="font-bold text-grape-700 hover:underline">
                  Add photos
                </Link>
              </Alert>
            </div>
          ) : item.photos.length < 3 ? (
            <p className="mt-3 text-xs text-muted">
              {say(
                `With ${item.photos.length === 1 ? "one photo" : "two photos"} the ad repeats them. Three or more make a better video.`,
                `Sa ${item.photos.length === 1 ? "isang photo" : "dalawang photo"}, uulit-ulitin lang ito ng ad. Mas maganda ang video kung tatlo o higit pa.`,
              )}
            </p>
          ) : null}
        </Panel>

        {item.photos.length ? (
          <Panel title="Template">
            <p className="mt-1 text-sm text-muted" role="status">
              {planning === "first"
                ? say("The AI is looking at the photos and making your ad…", "Tinitingnan ng AI ang photos at ginagawa ang ad mo…")
                : aiPick
                  ? say(
                      `The AI picked ${TEMPLATES[aiPick.template].label}${aiPick.reason ? `: ${aiPick.reason}` : "."} Pick another look to see the ad in it.`,
                      `${TEMPLATES[aiPick.template].label} ang pinili ng AI${aiPick.reason ? `: ${aiPick.reason}` : "."} Pumili ng ibang look para makita ang ad doon.`,
                    )
                  : say("Pick a look to see the ad in it.", "Pumili ng look para makita ang ad doon.")}
            </p>
            <div ref={strip} role="radiogroup" aria-label="Template" className="-mx-1 mt-3 grid auto-cols-[7rem] grid-flow-col gap-2 overflow-x-auto px-1 pb-2 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-3 sm:overflow-visible sm:pb-0">
              {TEMPLATE_IDS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={template === t}
                  disabled={busy}
                  onClick={() => pickTemplate(t)}
                  className={cx("flex flex-col rounded-2xl border-2 p-1.5 text-left transition-colors", template === t ? "border-grape-600 bg-grape-50" : "border-line bg-white hover:border-grape-300")}
                >
                  <span className="relative block w-full overflow-hidden rounded-xl bg-[#0b1020]" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
                    {ads ? <Still ad={ads[t]} /> : null}
                    {aiPick?.template === t ? (
                      <span className="absolute right-1.5 bottom-1.5 inline-flex items-center gap-1 rounded-full bg-sun px-2 py-0.5 text-[11px] font-bold text-sun-ink shadow-sm">
                        <Sparkles className="size-3" aria-hidden /> AI pick
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 block px-1 pb-0.5 text-sm font-bold">{TEMPLATES[t].label}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-ink/80">
              <span className="font-bold">{TEMPLATES[template].label}.</span> {TEMPLATES[template].about}
            </p>
          </Panel>
        ) : null}
      </div>

      <Panel title="Your Ad" className="lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1">
        <div className="relative mx-auto grid place-items-center overflow-hidden rounded-2xl bg-[#0b1020]" style={{ aspectRatio: `${size.width} / ${size.height}`, maxHeight: "30rem", maxWidth: "100%" }}>
          {ad ? (
            <canvas ref={canvas} width={size.width} height={size.height} className="size-full" aria-label={`Preview of the video ad for ${item.listing.name}`} />
          ) : (
            <p className="p-6 text-center text-sm text-white/80">{photoError ? say("The photos couldn't be loaded. Check your connection and reload.", "Hindi na-load ang photos. I-check ang connection mo at i-reload.") : item.photos.length ? "Loading the photos…" : "No photos to show."}</p>
          )}
          {ad && planning ? (
            <div className="absolute inset-0 grid place-items-center bg-[#0b1020]/80 p-6 text-center" role="status">
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <Sparkles className="size-4 animate-pulse motion-reduce:animate-none" aria-hidden />
                {planning === "first" ? say("The AI is making your ad…", "Ginagawa ng AI ang ad mo…") : say("The AI is making another version…", "Gumagawa ang AI ng ibang version…")}
              </p>
            </div>
          ) : null}
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
          <button
            type="button"
            onClick={() => void toggleSound()}
            disabled={!ad || busy}
            aria-pressed={hear}
            className={cx("grid size-9 shrink-0 place-items-center rounded-full disabled:opacity-50", hear ? "bg-grape-600 text-white hover:bg-grape-700" : "bg-grape-50 text-grape-700 hover:bg-grape-100")}
            aria-label={hear ? "Turn the preview's sound off" : "Hear the preview's sound"}
            title={hear ? "Sound on" : "Sound off"}
          >
            {hear ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
          </button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-grape-50" aria-hidden>
            <div ref={bar} className="h-full w-0 rounded-full bg-grape-600" />
          </div>
          <span className="shrink-0 text-xs text-muted tabular-nums">{timeline ? `${Math.round(timeline.duration)} sec` : ""}</span>
        </div>
        {ad ? (
          <p className="mt-2 text-xs text-muted">
            {say(
              `Music: ${MUSIC[music].label}, ${plan.byAi && plan.template === template ? "chosen by the AI" : "matched to the template"}. Press the speaker to hear it.`,
              `Music: ${MUSIC[music].label}, ${plan.byAi && plan.template === template ? "pinili ng AI" : "bagay sa template"}. Pindutin ang speaker para marinig.`,
            )}
          </p>
        ) : null}

        <div role="radiogroup" aria-label="Video shape" className="mt-4 grid grid-cols-3 gap-1 rounded-full bg-grape-50 p-1">
          {SHAPE_IDS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={shape === s}
              disabled={busy}
              title={SHAPES[s].use}
              onClick={() => {
                setShape(s);
                changed();
              }}
              className={cx("rounded-full px-2 py-1.5 text-xs font-bold transition-colors", shape === s ? "bg-white text-grape-800 shadow-sm" : "text-ink/70 hover:text-ink")}
            >
              {SHAPES[s].label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-center text-xs text-muted">
          {SHAPES[shape].label}: {SHAPES[shape].use}
        </p>

        <div className="mt-5 border-t border-line pt-5">
          {making.kind === "rendering" ? (
            <div role="status">
              <p className="text-sm font-semibold">Making your video… {Math.round(making.progress * 100)}%</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-grape-50">
                <div className="h-full rounded-full bg-grape-600 transition-[width]" style={{ width: `${Math.round(making.progress * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">{say("Keep this page open. It's made on your device, so nothing is uploaded.", "Huwag isara ang page na ito. Sa device mo ito ginagawa, kaya walang ina-upload.")}</p>
              <button type="button" onClick={() => abort.current?.abort()} className={cx(buttonClass("secondary"), "mt-3")}>
                Cancel
              </button>
            </div>
          ) : making.kind === "done" ? (
            <div>
              <Alert tone="success">
                {say("Your video is ready:", "Ready na ang video mo:")} {Math.round(making.file.seconds)} {say("seconds", "segundo")}, {(making.file.blob.size / 1_000_000).toFixed(1)} MB.
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
              {making.file.sound ? (
                <p className="mt-3 text-xs text-muted">
                  {say(
                    "The music is made for MyHomeSeller, so it's free to post anywhere. For a trending song instead, add it when you post and turn this video's own sound down.",
                    "Ginawa para sa MyHomeSeller ang music, kaya libreng i-post kahit saan. Kung trending song ang gusto mo, idagdag ito kapag ipo-post mo na at hinaan ang sariling sound ng video.",
                  )}
                </p>
              ) : (
                <div className="mt-3">
                  <Alert tone="info">
                    {say(
                      "This browser couldn't put the sound in the file, so the video is silent. Try Chrome on an Android phone or a computer, or Safari on an iPhone with iOS 26 or newer.",
                      "Hindi nailagay ng browser na ito ang sound sa file, kaya walang tunog ang video. Subukan sa Chrome sa Android phone o computer, o sa Safari sa iPhone na iOS 26 pataas.",
                    )}
                  </Alert>
                </div>
              )}
              <div className="mt-4 rounded-2xl border border-line p-4">
                <p className="text-sm font-bold">Post to Your Facebook Page</p>
                {!facebook.mayPost ? (
                  <p className="mt-1 text-xs text-muted">{say("Your role can't post to Facebook. An owner, admin or marketing teammate can.", "Hindi pwedeng mag-post sa Facebook ang role mo. Pwede ang owner, admin o marketing na teammate.")}</p>
                ) : !facebook.pages.length ? (
                  <p className="mt-1 text-xs text-muted">
                    {facebook.connected
                      ? say("You need to be an admin or editor of the connected Page to post there.", "Kailangan admin o editor ka ng naka-connect na Page para makapag-post doon.")
                      : say("Connect your Facebook Page first.", "I-connect muna ang Facebook Page mo.")}{" "}
                    <Link href="/app/integrations" className="font-bold text-grape-700 hover:underline">
                      Integrations
                    </Link>
                  </p>
                ) : posting.kind === "done" ? (
                  <div className="mt-2">
                    <Alert tone="success">
                      {say(`Posted to ${posting.page}. Facebook may take a minute to show the video.`, `Na-post na sa ${posting.page}. Baka abutin ng isang minuto bago lumabas ang video sa Facebook.`)}
                    </Alert>
                    {posting.link ? (
                      <a href={posting.link} target="_blank" rel="noreferrer" className={cx(buttonClass("secondary"), "mt-2")}>
                        <ExternalLink className="size-4" aria-hidden /> View on Facebook
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {facebook.pages.length > 1 ? (
                      <Select aria-label="Facebook Page" value={pageId} onChange={(e) => setPageId(e.target.value)} disabled={posting.kind === "uploading" || posting.kind === "posting"} className="mt-2">
                        {facebook.pages.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                    <p className="mt-2 text-xs text-muted">{say(`It goes on ${facebook.pages.find((p) => p.id === pageId)?.name ?? "your Page"} with this caption:`, `Mapo-post ito sa ${facebook.pages.find((p) => p.id === pageId)?.name ?? "Page mo"} na may ganitong caption:`)}</p>
                    {ad ? <p className="mt-1.5 max-h-40 overflow-y-auto rounded-xl bg-grape-50 p-3 text-xs whitespace-pre-line text-ink/90">{videoCaption(ad.text, item.listing, item.link)}</p> : null}
                    <button type="button" onClick={() => void postToPage()} disabled={!adId || posting.kind === "uploading" || posting.kind === "posting"} className={cx(buttonClass("primary"), "mt-3 w-full")}>
                      <Send className="size-4" aria-hidden />
                      {posting.kind === "uploading" ? "Uploading the video…" : posting.kind === "posting" ? "Posting to Facebook…" : "Post to Facebook"}
                    </button>
                    <p className="mt-2 text-xs text-muted">
                      {say("The video is uploaded only when you press Post, and our copy is deleted a day later.", "Ina-upload lang ang video kapag pinindot mo ang Post, at binubura ang kopya namin pagkalipas ng isang araw.")}
                    </p>
                    {posting.kind === "error" ? (
                      <div className="mt-2">
                        <Alert>{posting.message}</Alert>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <div className="mt-4">{anotherButton}</div>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => void make()} disabled={!ad || busy || planning !== null || left === 0} className={cx(buttonClass("sun"), "w-full")}>
                {making.kind === "starting" ? "Starting…" : "Make the Video"}
              </button>
              <div className="mt-2">{anotherButton}</div>
              <p className="mt-3 text-center text-xs text-muted tabular-nums">
                {left === null
                  ? say("Unlimited video ads on your plan.", "Unlimited ang video ads sa plan mo.")
                  : left === 0
                    ? say(`All ${limit} video ads made this month. They renew on the 1st.`, `Nagawa na lahat ng ${limit} video ads ngayong buwan. Magre-renew sa a-uno.`)
                    : say(
                        `${left} of ${limit} video ads left this month. Only a video you make is counted; another version is free.`,
                        `${left} sa ${limit} video ads na lang ngayong buwan. Ang video na ginawa mo lang ang binibilang; libre ang ibang version.`,
                      )}
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
    </div>
  );
}
