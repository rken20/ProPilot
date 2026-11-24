/**
 * Turns a video ad into a file, in the browser. Each frame is drawn on a canvas
 * and encoded with the browser's own video encoder, then packed into an MP4.
 * Nothing is uploaded: the photos are read from the listing and the finished
 * file stays on the owner's device.
 */
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { drawFrame, timelineFor, SANS, SERIF, type Photo, type RenderAd } from "./draw";
import { FPS, MAX_PHOTOS, SHAPES, type ShapeId } from "./spec";

export type VideoFile = { blob: Blob; ext: "mp4" | "webm"; seconds: number };
type Progress = (done: number) => void;

/** H.264 first (plays everywhere and is what Facebook and TikTok expect); VP9 only where a browser can't encode H.264. */
const CODECS: Array<{ codec: string; mux: "avc" | "vp9"; maxPixels?: number }> = [
  { codec: "avc1.640028", mux: "avc" },
  { codec: "avc1.4d0028", mux: "avc" },
  { codec: "avc1.42e028", mux: "avc" },
  { codec: "avc1.42001f", mux: "avc", maxPixels: 921_600 },
  { codec: "vp09.00.40.08", mux: "vp9" },
];

// About 3.6 Mbps for the vertical shape: sharp on a phone, and around 8 MB for a 20-second ad.
const bitrateFor = (shape: ShapeId) => Math.round(SHAPES[shape].width * SHAPES[shape].height * 3.9);

/** Canvas text uses the app's fonts, which have to be loaded before the first frame is drawn. */
export async function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all([`800 40px ${SANS}`, `600 40px ${SANS}`, `500 40px ${SANS}`, `500 40px ${SERIF}`, `800 40px ${SERIF}`].map((f) => document.fonts.load(f).catch(() => [])));
}

/** Load the listing's photos for drawing, scaled down to what any shape needs. Photos that fail to load are skipped. */
export async function loadPhotos(urls: string[], signal?: AbortSignal): Promise<Photo[]> {
  const longest = 1800;
  const loaded = await Promise.all(
    urls.slice(0, MAX_PHOTOS).map(async (url) => {
      try {
        const blob = await (await fetch(url, { signal })).blob();
        const first = await createImageBitmap(blob);
        const scale = Math.min(1, longest / Math.max(first.width, first.height));
        if (scale >= 1) return first;
        try {
          const small = await createImageBitmap(first, { resizeWidth: Math.round(first.width * scale), resizeHeight: Math.round(first.height * scale), resizeQuality: "high" });
          first.close();
          return small;
        } catch {
          return first;
        }
      } catch {
        return null;
      }
    }),
  );
  return loaded.filter((p): p is ImageBitmap => p !== null);
}

async function pickCodec(width: number, height: number, bitrate: number) {
  if (typeof VideoEncoder === "undefined") return null;
  for (const c of CODECS) {
    if (c.maxPixels && width * height > c.maxPixels) continue;
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec: c.codec, width, height, bitrate, framerate: FPS });
      if (supported) return c;
    } catch {
      // Try the next one.
    }
  }
  return null;
}

const pause = () => new Promise<void>((r) => setTimeout(r, 0));

/** Make the video file. `onProgress` gets 0 to 1. Throws an AbortError if `signal` is aborted. */
export async function exportVideo(ad: RenderAd, onProgress?: Progress, signal?: AbortSignal): Promise<VideoFile> {
  await ensureFonts();
  const { width, height } = SHAPES[ad.shape];
  const timeline = timelineFor(ad);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("This browser can't draw the video.");
  const bitrate = bitrateFor(ad.shape);
  const chosen = await pickCodec(width, height, bitrate);
  if (!chosen) return record(ad, canvas, ctx, onProgress, signal);

  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: chosen.mux, width, height, frameRate: FPS }, fastStart: "in-memory" });
  let failed: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failed = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure({ codec: chosen.codec, width, height, bitrate, framerate: FPS, latencyMode: "quality" });
  try {
    for (let f = 0; f < timeline.frames; f++) {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      if (failed) throw failed;
      drawFrame(ctx, ad, timeline, f / FPS);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1_000_000) / FPS), duration: Math.round(1_000_000 / FPS) });
      encoder.encode(frame, { keyFrame: f % (FPS * 2) === 0 });
      frame.close();
      // Don't draw faster than the encoder can take, and let the page breathe.
      while (encoder.encodeQueueSize > 6) await pause();
      if (f % 6 === 0) {
        onProgress?.(f / timeline.frames);
        await pause();
      }
    }
    await encoder.flush();
    if (failed) throw failed;
    muxer.finalize();
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
  onProgress?.(1);
  return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), ext: "mp4", seconds: timeline.duration };
}

/** For browsers without a video encoder: play the ad on the canvas and record it as it plays. */
async function record(ad: RenderAd, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, onProgress?: Progress, signal?: AbortSignal): Promise<VideoFile> {
  if (typeof MediaRecorder === "undefined" || !canvas.captureStream) throw new Error("This browser can't make videos. Try Chrome, Edge or Safari.");
  const type = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error("This browser can't make videos. Try Chrome, Edge or Safari.");
  const timeline = timelineFor(ad);
  const recorder = new MediaRecorder(canvas.captureStream(FPS), { mimeType: type, videoBitsPerSecond: bitrateFor(ad.shape) });
  const parts: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  drawFrame(ctx, ad, timeline, 0);
  recorder.start();
  const began = performance.now();
  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      const t = (performance.now() - began) / 1000;
      if (signal?.aborted) return reject(new DOMException("Cancelled", "AbortError"));
      drawFrame(ctx, ad, timeline, t);
      onProgress?.(Math.min(1, t / timeline.duration));
      if (t >= timeline.duration) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }).finally(() => recorder.state !== "inactive" && recorder.stop());
  await stopped;
  return { blob: new Blob(parts, { type: type.split(";")[0] }), ext: type.includes("mp4") ? "mp4" : "webm", seconds: timeline.duration };
}
