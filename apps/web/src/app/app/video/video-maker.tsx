"use client";

import { useSay } from "@/components/lang";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, Plus, Share2, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { Alert, Field, Input, Panel, Select, buttonClass, cx } from "@/components/ui";
import { drawFrame, timelineFor, type Photo, type RenderAd } from "@/lib/video-ad/draw";
import { PreviewSound, decodeMusic, renderSoundtrack } from "@/lib/video-ad/audio";
import { ensureFonts, exportVideo, loadPhotos, type VideoFile } from "@/lib/video-ad/export";
import { MUSIC, MUSIC_FOR, MUSIC_IDS, soundCues, type MusicChoice } from "@/lib/video-ad/sound";
import {
  LIMITS,
  MAX_LINES,
  SHAPES,
  SHAPE_IDS,
  TEMPLATES,
  TEMPLATE_IDS,
  amountsIn,
  cleanPlan,
  cleanText,
  type AdLanguage,
  type AdListing,
  type AdText,
  type PhotoPlan,
  type ShapeId,
  type TemplateId,
} from "@/lib/video-ad/spec";
import type { startVideoAd, suggestAd } from "./actions";

/** A listing to make an ad for. `thumbs` are small versions of `photos`, in the same order. */
export type VideoItem = { id: string; listing: AdListing; photos: string[]; thumbs: string[] };

type Suggestion = { template: TemplateId; reason: string; byAi: boolean; sawPhotos: boolean };
type Making =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "rendering"; progress: number }
  | { kind: "done"; url: string; name: string; file: VideoFile }
  | { kind: "error"; message: string };

/** A music file the owner picked. It is read on the device and never uploaded. */
type OwnMusic = { id: number; name: string; buffer: AudioBuffer };
const MAX_MUSIC_BYTES = 30_000_000;

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
  const say = useSay();
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const first = byId.get(initialId) ?? items[0]!;
  const start = useMemo(() => cleanPlan(null, first.listing, first.photos.length, language), [first, language]);

  const [id, setId] = useState(first.id);
  const [shape, setShape] = useState<ShapeId>("vertical");
  const [template, setTemplate] = useState<TemplateId>(start.template);
  const [text, setText] = useState<AdText>(start.text);
  /** Openings to choose from: the AI's, or ones built from the listing's facts. */
  const [hooks, setHooks] = useState<string[]>(start.hooks);
  /** Which photo opens the ad and which photo each feature line is shown over. */
  const [picks, setPicks] = useState<PhotoPlan>(start.photos);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  // The AI's suggestion for the first listing is asked for as soon as the page opens.
  const [planning, setPlanning] = useState(first.photos.length > 0);
  const [photos, setPhotos] = useState<{ id: string; list: Photo[] } | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [making, setMaking] = useState<Making>({ kind: "idle" });
  const [left, setLeft] = useState(limit === null ? null : Math.max(0, limit - used));
  /** The owner's music choice; until they make one, the music follows the template. */
  const [musicPick, setMusicPick] = useState<MusicChoice | null>(null);
  const [effects, setEffects] = useState(true);
  const [own, setOwn] = useState<OwnMusic | null>(null);
  const [ownState, setOwnState] = useState<"idle" | "reading" | "error" | "too-big">("idle");
  /** Whether the preview plays its sound. Off until pressed: browsers only allow sound after a tap. */
  const [hear, setHear] = useState(false);
  const [track, setTrack] = useState<{ key: string; buffer: AudioBuffer | null } | null>(null);
  const preview = useRef<PreviewSound | null>(null);

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
    setSuggestion({ template: res.plan.template, reason: res.plan.reason, byAi: res.plan.byAi, sawPhotos: res.plan.sawPhotos });
    setHooks(res.plan.hooks);
    if (force || !touched.current) {
      setTemplate(res.plan.template);
      setText(res.plan.text);
      setPicks(res.plan.photos);
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
    setHooks(plan.hooks);
    setPicks(plan.photos);
    setSuggestion(null);
    setPlanning(next.photos.length > 0);
    setPhotoError(false);
    setPhotos(null);
    setMaking({ kind: "idle" });
    void loadFor(next);
    if (next.photos.length) void askAi(nextId, false);
  }

  /** A finished video is for the ad as it was: any change brings the Make button back. */
  const changed = () => {
    touched.current = true;
    if (making.kind === "done" || making.kind === "error") setMaking({ kind: "idle" });
  };
  const edit = (change: (t: AdText) => AdText) => {
    changed();
    setText(change);
  };
  const removeLine = (i: number) => {
    edit((t) => ({ ...t, lines: t.lines.filter((_, k) => k !== i) }));
    // Each line keeps its own photo: drop the removed line's pick, not its neighbour's.
    setPicks((p) => ({ ...p, forLines: p.forLines.filter((_, k) => k !== i) }));
  };
  /** Show the next photo over a line. */
  const nextPhotoFor = (i: number, now: number) => {
    changed();
    setPicks((p) => {
      const forLines = Array.from({ length: Math.max(p.forLines.length, i + 1) }, (_, k) => p.forLines[k] ?? -1);
      forLines[i] = (now + 1) % item.photos.length;
      return { ...p, forLines };
    });
  };

  const ready = photos?.id === id && photos.list.length > 0 && fontsReady;
  const ad = useMemo<RenderAd | null>(
    () => (ready && photos ? { template, shape, listing: item.listing, text: cleanText(text), photos: photos.list, picks } : null),
    [ready, photos, template, shape, item.listing, text, picks],
  );
  const timeline = useMemo(() => (ad ? timelineFor(ad) : null), [ad]);
  const busy = making.kind === "starting" || making.kind === "rendering";
  /** Other openings to offer. Price Reveal keeps the price for the last card, so openings that state it are left out. */
  const otherHooks = hooks.filter((h) => h !== text.hook && !(template === "reveal" && amountsIn(h).length > 0));
  /** The photo behind each feature line, as the ad shows it now. */
  const linePhotos = useMemo(() => (timeline ? timeline.scenes.filter((sc) => sc.kind === "photo").map((sc) => sc.photo) : []), [timeline]);

  const canvas = useRef<HTMLCanvasElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  /** Where the preview is, in seconds into the ad. */
  const clock = useRef({ t: 0, last: 0 });

  // The soundtrack: music and sound effects, made on the device for the ad as it is now.
  const music: MusicChoice = musicPick ?? MUSIC_FOR[template];
  const cues = useMemo(() => (timeline ? soundCues(template, timeline) : []), [template, timeline]);
  const soundMusic = music === "own" ? (own?.buffer ?? null) : music === "none" ? null : music;
  const wantsSound = soundMusic !== null || effects;
  const soundKey = timeline ? JSON.stringify([music, music === "own" ? (own?.id ?? 0) : 0, effects, timeline.duration, cues]) : "";
  const soundFor = useCallback(
    () => (timeline && wantsSound ? renderSoundtrack({ duration: timeline.duration, music: soundMusic, cues, effects }) : Promise.resolve(null)),
    [timeline, wantsSound, soundMusic, cues, effects],
  );
  /** A change of sound makes a new video, but it isn't a change to the ad's words, so a late AI answer may still fill them in. */
  const soundChanged = () => {
    if (making.kind === "done" || making.kind === "error") setMaking({ kind: "idle" });
  };

  // Make the preview's sound when it's switched on, again after each change (a moment later, so typing doesn't redo it every key).
  useEffect(() => {
    if (!hear || !timeline || busy || track?.key === soundKey) return;
    let live = true;
    const timer = setTimeout(() => {
      void soundFor()
        .catch(() => null)
        .then((buffer) => live && setTrack({ key: soundKey, buffer }));
    }, 250);
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

  /** Back to the start of the ad, picture and sound together. */
  const rewind = () => {
    clock.current.t = 0;
    preview.current?.seek(0);
  };

  async function toggleSound() {
    if (hear) return setHear(false);
    preview.current ??= new PreviewSound();
    if (await preview.current.unlock()) {
      setHear(true);
      setPlaying(true);
    }
  }

  async function pickOwnMusic(file: File | undefined) {
    if (!file) return;
    soundChanged();
    if (file.size > MAX_MUSIC_BYTES) return setOwnState("too-big");
    setOwnState("reading");
    try {
      const buffer = await decodeMusic(file);
      setOwn({ id: Date.now(), name: file.name, buffer });
      setOwnState("idle");
    } catch {
      setOwnState("error");
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
    if (!ad || busy) return;
    const clean = cleanText(text);
    if (clean.hook.length < 3) return setMaking({ kind: "error", message: say("Write a headline for the ad first.", "Sumulat muna ng headline para sa ad.") });
    setMaking({ kind: "starting" });
    const key = JSON.stringify([id, template, shape, clean, picks]);
    if (counted.current !== key) {
      const res = await begin(id, template, shape, clean).catch(() => ({ ok: undefined, left: undefined, error: say("Couldn't reach the server. Check your connection and try again.", "Hindi maabot ang server. I-check ang connection mo at subukan ulit.") }));
      if (res.error || !res.ok) return setMaking({ kind: "error", message: res.error ?? "Couldn't start the video. Please try again." });
      counted.current = key;
      if (res.left !== undefined) setLeft(res.left);
    }
    abort.current = new AbortController();
    setMaking({ kind: "rendering", progress: 0 });
    try {
      // The sound is made first, in a fraction of a second; if it fails the video is made silent rather than not at all.
      const sound = track?.key === soundKey ? track.buffer : await soundFor().catch(() => null);
      const file = await exportVideo({ ...ad, text: clean }, sound, (progress) => setMaking({ kind: "rendering", progress }), abort.current.signal);
      setMaking({ kind: "done", url: URL.createObjectURL(file.blob), name: fileName(item.listing.name, shape, file.ext), file });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return setMaking({ kind: "idle" });
      setMaking({
        kind: "error",
        message: say("The video couldn't be made on this device. It wasn't counted again, so you can press Make the video once more, or try in Chrome on a computer.", "Hindi nagawa ang video sa device na ito. Hindi ito binilang ulit, kaya pwede mong pindutin ulit ang Make the video, o subukan sa Chrome sa computer."),
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
    rewind();
    if (making.kind === "done" || making.kind === "error") setMaking({ kind: "idle" });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <Panel title="Listing" className="lg:col-start-1">
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
        ) : (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-ink">Opening photo</legend>
            <p className="mt-0.5 text-xs text-muted">
              {say("The first thing people see, so pick the most striking one.", "Ito ang unang makikita ng tao, kaya piliin ang pinakamaganda.")}
              {item.photos.length < 3
                ? say(
                    ` With ${item.photos.length === 1 ? "one photo" : "two photos"} the ad repeats them; three or more make a better video.`,
                    ` Sa ${item.photos.length === 1 ? "isang photo" : "dalawang photo"}, uulit-ulitin lang ito ng ad; mas maganda ang video kung tatlo o higit pa.`,
                  )
                : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.thumbs.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  disabled={busy}
                  aria-pressed={picks.opener === i}
                  aria-label={`Open the video with photo ${i + 1}`}
                  onClick={() => {
                    changed();
                    rewind();
                    setPicks((p) => ({ ...p, opener: i }));
                  }}
                  className={cx("overflow-hidden rounded-xl border-2 transition-colors", picks.opener === i ? "border-grape-600 ring-2 ring-grape-100" : "border-transparent hover:border-grape-300")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnails from storage */}
                  <img src={src} alt="" loading="lazy" className="h-14 w-20 object-cover" />
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </Panel>

      <Panel title="Preview" className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="mx-auto grid place-items-center overflow-hidden rounded-2xl bg-[#0b1020]" style={{ aspectRatio: `${size.width} / ${size.height}`, maxHeight: "30rem", maxWidth: "100%" }}>
          {ad ? (
            <canvas ref={canvas} width={size.width} height={size.height} className="size-full" aria-label={`Preview of the video ad for ${item.listing.name}`} />
          ) : (
            <p className="p-6 text-center text-sm text-white/80">{photoError ? say("The photos couldn't be loaded. Check your connection and reload.", "Hindi na-load ang photos. I-check ang connection mo at i-reload.") : item.photos.length ? "Loading the photos…" : "No photos to show."}</p>
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
          <button
            type="button"
            onClick={() => void toggleSound()}
            disabled={!ad || busy || !wantsSound}
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
              {wantsSound && !making.file.sound ? (
                <div className="mt-3">
                  <Alert tone="info">
                    {say(
                      "This browser couldn't put the sound in the file, so the video is silent. Try Chrome on an Android phone or a computer, or Safari on an iPhone with iOS 26 or newer.",
                      "Hindi nailagay ng browser na ito ang sound sa file, kaya walang tunog ang video. Subukan sa Chrome sa Android phone o computer, o sa Safari sa iPhone na iOS 26 pataas.",
                    )}
                  </Alert>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">
                  {making.file.sound
                    ? say(
                        "For a trending song instead, pick No music under Sound and add the song when you post it on Facebook, TikTok or Instagram.",
                        "Kung trending song ang gusto mo, piliin ang No music sa Sound at idagdag ang kanta kapag ipo-post mo na sa Facebook, TikTok o Instagram.",
                      )
                    : say(
                        "The video has no sound. Add music when you post it: Facebook, TikTok and Instagram offer songs you're allowed to use.",
                        "Walang sound ang video. Lagyan ng music kapag ipo-post mo na: may mga kantang puwedeng gamitin sa Facebook, TikTok at Instagram.",
                      )}
                </p>
              )}
            </div>
          ) : (
            <>
              <button type="button" onClick={() => void make()} disabled={!ad || busy || left === 0} className={cx(buttonClass("sun"), "w-full")}>
                {making.kind === "starting" ? "Starting…" : "Make the Video"}
              </button>
              <p className="mt-2 text-center text-xs text-muted tabular-nums">
                {left === null
                  ? say("Unlimited video ads on your plan.", "Unlimited ang video ads sa plan mo.")
                  : left === 0
                    ? say(`All ${limit} video ads made this month. They renew on the 1st.`, `Nagawa na lahat ng ${limit} video ads ngayong buwan. Magre-renew sa a-uno.`)
                    : say(`${left} of ${limit} video ads left this month.`, `${left} sa ${limit} video ads na lang ngayong buwan.`)}
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
              ? say("The AI is looking at the photos, choosing a template and writing the text…", "Tinitingnan ng AI ang photos, pumipili ng template at sinusulat ang text…")
              : suggestion?.byAi
                ? say(
                    `The AI ${suggestion.sawPhotos ? "looked at the photos and " : ""}suggests ${TEMPLATES[suggestion.template].label}${suggestion.reason ? `: ${suggestion.reason}` : "."}`,
                    `${suggestion.sawPhotos ? "Tiningnan ng AI ang photos at ang suggestion nito ay" : "Suggestion ng AI ang"} ${TEMPLATES[suggestion.template].label}${suggestion.reason ? `: ${suggestion.reason}` : "."}`,
                  )
                : say("Pick the look of the ad. You can change it any time before making the video.", "Piliin ang itsura ng ad. Pwede mo itong palitan kahit kailan bago gawin ang video.")}
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

        <Panel title="Sound">
          <p className="mt-1 text-sm text-muted">
            {say(
              "Music made for MyHomeSeller, so it's free to post anywhere, and sound effects timed to the cuts. Press the speaker under the preview to hear it.",
              "Music na ginawa para sa MyHomeSeller, kaya libreng i-post kahit saan, at sound effects na sabay sa bawat cut. Pindutin ang speaker sa ilalim ng preview para marinig.",
            )}
          </p>
          <div role="radiogroup" aria-label="Music" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(["none", ...MUSIC_IDS, "own"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={music === m}
                disabled={busy}
                onClick={() => {
                  soundChanged();
                  setMusicPick(m);
                }}
                className={cx("rounded-2xl border-2 p-3 text-left transition-colors", music === m ? "border-grape-600 bg-grape-50" : "border-line bg-white hover:border-grape-300")}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{m === "none" ? "No music" : m === "own" ? "Your own music" : MUSIC[m].label}</span>
                  {m === MUSIC_FOR[template] ? <span className="rounded-full bg-grape-100 px-2 py-0.5 text-[11px] font-bold text-grape-800">Suggested</span> : null}
                </span>
                <span className="mt-1 block text-xs text-ink/75">
                  {m === "none"
                    ? say("Silent, or add a song when you post.", "Walang music, o magdagdag ng kanta kapag ipo-post mo.")
                    : m === "own"
                      ? say("A music file on your device.", "Music file mula sa device mo.")
                      : say(MUSIC[m].about[0], MUSIC[m].about[1])}
                </span>
              </button>
            ))}
          </div>
          {music === "own" ? (
            <div className="mt-3 rounded-2xl border border-line p-4">
              <label htmlFor="video-music-file" className="text-sm font-medium text-ink">
                Music file
              </label>
              <input
                id="video-music-file"
                type="file"
                accept="audio/*"
                disabled={busy || ownState === "reading"}
                onChange={(e) => void pickOwnMusic(e.target.files?.[0])}
                className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-grape-50 file:px-4 file:py-2 file:font-semibold file:text-grape-800 hover:file:bg-grape-100"
              />
              <p className="mt-2 text-xs text-muted" role="status">
                {ownState === "reading"
                  ? say("Reading the file…", "Binabasa ang file…")
                  : ownState === "error"
                    ? say("This file couldn't be read. Try an MP3 or M4A file.", "Hindi mabasa ang file na ito. Subukan ang MP3 o M4A file.")
                    : ownState === "too-big"
                      ? say("That file is too big. Pick one under 30 MB.", "Masyadong malaki ang file. Pumili ng mas mababa sa 30 MB.")
                      : own
                        ? say(
                            `Using ${own.name}${timeline ? `, from the start, for ${Math.round(timeline.duration)} seconds` : ""}.`,
                            `Gamit ang ${own.name}${timeline ? `, mula sa simula, nang ${Math.round(timeline.duration)} segundo` : ""}.`,
                          )
                        : say("No file chosen yet.", "Wala pang napiling file.")}
              </p>
              <p className="mt-2 text-xs text-muted">
                {say(
                  "Use only music you have the right to use: Facebook, TikTok and Instagram may mute or take down a video with a song you don't have the rights to. The file stays on your device.",
                  "Gumamit lang ng music na may karapatan kang gamitin: puwedeng i-mute o tanggalin ng Facebook, TikTok at Instagram ang video na may kantang wala kang karapatan. Sa device mo lang ang file.",
                )}
              </p>
            </div>
          ) : null}
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={effects}
              disabled={busy}
              onChange={(e) => {
                soundChanged();
                setEffects(e.target.checked);
              }}
              className="mt-0.5 size-4 accent-grape-600"
            />
            <span>
              <span className="font-medium text-ink">Sound effects</span>
              <span className="block text-xs text-muted">
                {say("A whoosh on each cut, a pop as each line comes in, and a chime on the price.", "May whoosh sa bawat cut, pop sa bawat line na lalabas, at chime sa presyo.")}
                {template === "reveal" ? say(" Price Reveal builds up to the price instead.", " Sa Price Reveal, may build-up papunta sa presyo.") : ""}
              </span>
            </span>
          </label>
        </Panel>

        <Panel title="Text">
          <p className="mt-1 text-sm text-muted">
            {say("Every word is yours to change. The price, location, financing and your business name come from the listing and are added for you.", "Pwede mong palitan ang bawat salita. Galing sa listing ang presyo, location, financing at pangalan ng business mo, at kusa nang idinadagdag.")}
          </p>
          <div className="mt-4 space-y-4">
            <Field label="Headline" htmlFor="video-hook" hint={say("People decide in about three seconds. Lead with what makes this property stand out.", "Mga tatlong segundo lang bago mag-decide ang tao. Unahin kung ano ang nagpapa-stand out sa property na ito.")}>
              <Input id="video-hook" value={text.hook} maxLength={LIMITS.hook} disabled={busy} onChange={(e) => edit((t) => ({ ...t, hook: e.target.value }))} />
            </Field>
            {otherHooks.length ? (
              <div className="-mt-1">
                <p className="text-xs text-muted">Or open with:</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {otherHooks.map((h) => (
                    <button
                      key={h}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        rewind();
                        edit((t) => ({ ...t, hook: h }));
                      }}
                      className="rounded-full border border-grape-100 bg-grape-50 px-3 py-1.5 text-left text-sm font-semibold text-grape-800 hover:border-grape-300"
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <fieldset>
              <legend className="text-sm font-medium text-ink">Feature lines</legend>
              <p className="mt-0.5 text-xs text-muted">
                {say(
                  "One short feature each. They appear one at a time over the photos; press a line's photo to change which one it goes over.",
                  "Isang maikling feature kada line. Isa-isa silang lalabas sa ibabaw ng photos; pindutin ang photo ng line para palitan kung saang photo ito lalabas.",
                )}
                {template === "reasons" && text.lines.length > 3 ? say(" Top 3 Reasons shows the first three.", " Ang unang tatlo lang ang ipapakita ng Top 3 Reasons.") : ""}
              </p>
              <ul className="mt-2 space-y-2">
                {text.lines.map((line, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {linePhotos[i] !== undefined && item.thumbs[linePhotos[i]] ? (
                      <button
                        type="button"
                        disabled={busy || item.photos.length < 2}
                        onClick={() => nextPhotoFor(i, linePhotos[i]!)}
                        className="shrink-0 overflow-hidden rounded-lg border border-line hover:border-grape-300"
                        aria-label={`Feature line ${i + 1} is shown over photo ${linePhotos[i]! + 1}. Press for the next photo.`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- small thumbnails from storage */}
                        <img src={item.thumbs[linePhotos[i]!]} alt="" className="size-10 object-cover" />
                      </button>
                    ) : null}
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
                      onClick={() => removeLine(i)}
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
            <Field label="Call to action" htmlFor="video-cta" hint={say("What should the viewer do next?", "Ano ang dapat gawin ng manonood pagkatapos?")}>
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
