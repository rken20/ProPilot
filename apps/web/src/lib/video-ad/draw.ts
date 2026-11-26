/**
 * Draws one frame of a video ad on a canvas. The preview and the exported video
 * both call drawFrame, so what the owner sees is what the file contains.
 *
 * The ad is cut like a reel: the headline is on screen from the first frame,
 * each photo is a short clip with a camera move that starts fast and settles,
 * captions are large and come in word by word, and scenes change with a hard
 * move on the beat, not a slow dissolve.
 *
 * Photos are drawn as they are: cropped to fill the frame and moved (zoom and
 * pan), never altered. Everything else is text and flat shapes. Text stays out
 * of the top and bottom of a vertical video, where apps put their own buttons.
 */
import { CAPTION_AT, PRICE_AT, SHAPES, amountsIn, buildTimeline, sceneAt, shortPlace, shortPrice, termsOf, type AdListing, type AdText, type PhotoPlan, type Scene, type ShapeId, type TemplateId, type Timeline } from "./spec";

export type Photo = CanvasImageSource & { width: number; height: number };
export type RenderAd = { template: TemplateId; shape: ShapeId; listing: AdListing; text: AdText; photos: Photo[]; picks?: PhotoPlan };

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Rect = { x: number; y: number; w: number; h: number };
type Env = {
  ctx: Ctx;
  W: number;
  H: number;
  /** One hundredth of the frame's shorter side: every size is a multiple of it, so the three shapes share one layout. */
  u: number;
  /** The unit for small text: a little larger on the vertical shape, which is narrow and watched on a phone. */
  tu: number;
  /** Room kept clear of the edges (more at the top and bottom of a vertical video, where apps put their buttons). */
  pad: { x: number; top: number; bottom: number };
  ad: RenderAd;
  tl: Timeline;
  t: number;
};

export const SANS = '"Plus Jakarta Sans Variable", system-ui, sans-serif';
export const SERIF = '"Newsreader Variable", Georgia, serif';
const NAVY = "#0c2563";
const DEEP = "#081a47";
const BLUE = "#1565e6";
const SUN = "#f8c423";
const GOLD = "#d8b46a";
const INK = "rgba(6,14,40,0.92)";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** Overshoots a little and settles: the "pop" of a caption or a sticker. */
const backOut = (x: number) => {
  const a = clamp01(x) - 1;
  return 1 + 2.70158 * a * a * a + 1.70158 * a * a;
};

/** How far an element has come in: `a` for opacity, `rise` for how much it still has to move (1 → 0). */
function enter(local: number, delay = 0.2, length = 0.35) {
  const a = clamp01((local - delay) / length);
  return { a, rise: 1 - easeOut(a) };
}

const font = (ctx: Ctx, weight: number, size: number, family = SANS) => {
  ctx.font = `${weight} ${Math.round(size)}px ${family}`;
};

function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The largest size, from `size` down to `min`, at which the text fits the width in at most `maxLines` lines. */
function fit(ctx: Ctx, text: string, maxWidth: number, maxLines: number, size: number, min: number, weight: number, family = SANS) {
  let s = size;
  for (;;) {
    font(ctx, weight, s, family);
    const lines = wrap(ctx, text, maxWidth);
    const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    if ((lines.length <= maxLines && widest <= maxWidth) || s <= min) return { size: s, lines: lines.slice(0, maxLines) };
    s = Math.max(min, s * 0.93);
  }
}

/** One line if it fits at a readable size, otherwise two lines a little smaller. */
function fitShort(ctx: Ctx, text: string, maxWidth: number, size: number, min: number, weight: number, twoLineSize = min) {
  const one = fit(ctx, text, maxWidth, 1, size, min, weight);
  font(ctx, weight, one.size);
  if (ctx.measureText(one.lines[0] ?? "").width <= maxWidth && wrap(ctx, text, maxWidth).length <= 1) return one;
  return fit(ctx, text, maxWidth, 2, Math.min(size, twoLineSize), twoLineSize * 0.8, weight);
}

function rounded(ctx: Ctx, r: Rect, radius: number) {
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad);
  ctx.closePath();
}

const full = (env: Env): Rect => ({ x: 0, y: 0, w: env.W, h: env.H });
/** The width text may take: the frame less its margins, and not the whole of a wide frame. */
const textWidth = (env: Env) => (env.ad.shape === "wide" ? env.W * 0.72 : env.W - env.pad.x * 2);
const lengthOf = (scene: Scene) => scene.end - scene.start;

// ---------------------------------------------------------------- photos and the camera

type Camera = { zoom: number; panX: number; panY: number };

/** Fill the rectangle with the photo (cropping the overflow), zoomed and panned for the camera move. */
function photo(env: Env, index: number, r: Rect, cam: Camera) {
  const { ctx, ad } = env;
  const img = ad.photos[index % Math.max(1, ad.photos.length)];
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  if (!img) {
    ctx.fillStyle = NAVY;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  } else {
    const s = Math.max(r.w / img.width, r.h / img.height) * Math.max(1, cam.zoom);
    const dw = img.width * s;
    const dh = img.height * s;
    const ox = (dw - r.w) / 2;
    const oy = (dh - r.h) / 2;
    const px = Math.max(-1, Math.min(1, cam.panX));
    const py = Math.max(-1, Math.min(1, cam.panY));
    ctx.drawImage(img, r.x - ox - px * ox, r.y - oy - py * oy, dw, dh);
  }
  ctx.restore();
}

/**
 * The camera for a scene. Every move starts fast and settles into a glide, so a
 * cut lands with energy and the photo is never still. The moves take turns:
 * push in, travel across the photo, pull back, rise. A photo wider than the
 * frame is travelled across, which shows far more of it than a centre crop.
 */
function camera(scene: Scene, local: number, energy: number): Camera {
  const x = local / Math.max(0.1, lengthOf(scene));
  const p = 0.42 * easeOut(local / 0.55) + 0.58 * x;
  if (scene.kind === "intro") return { zoom: 1.3 - 0.2 * easeOut(local / 0.6) + 0.07 * x * energy, panX: 0, panY: 0 };
  if (scene.kind === "outro") return { zoom: 1.08 + 0.08 * x, panX: 0, panY: 0 };
  const e = energy;
  switch (scene.index % 4) {
    case 0:
      return { zoom: 1.03 + 0.17 * e * p, panX: 0, panY: 0 };
    case 1:
      return { zoom: 1.08, panX: (-0.55 + 1.05 * p) * Math.min(1, e), panY: 0 };
    case 2:
      return { zoom: 1.03 + 0.19 * e * (1 - Math.min(1, p)), panX: 0.1, panY: 0 };
    default:
      return { zoom: 1.1, panX: (-0.4 + 0.75 * p) * Math.min(1, e), panY: 0.5 - 0.9 * Math.min(1, p) };
  }
}

/** A dark wash over part of the frame so text reads on any photo. `from` and `to` are fractions of the height; the wash is strongest at `to`. */
function wash(env: Env, from: number, to: number, color: string, strength: number) {
  const { ctx, W, H } = env;
  const y0 = H * Math.min(from, to);
  const y1 = H * Math.max(from, to);
  const g = ctx.createLinearGradient(0, H * from, 0, H * to);
  const hex = (a: number) =>
    Math.round(clamp01(a) * 255)
      .toString(16)
      .padStart(2, "0");
  g.addColorStop(0, `${color}00`);
  g.addColorStop(0.6, `${color}${hex(strength * 0.7)}`);
  g.addColorStop(1, `${color}${hex(strength)}`);
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, W, y1 - y0);
}

// ---------------------------------------------------------------- small parts

function pin(ctx: Ctx, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size * 0.4, size * 0.4, Math.PI, 0);
  ctx.quadraticCurveTo(x + size * 0.9, y + size * 0.72, x + size / 2, y + size * 1.05);
  ctx.quadraticCurveTo(x + size * 0.1, y + size * 0.72, x + size * 0.1, y + size * 0.4);
  ctx.fill();
  ctx.restore();
}

function check(ctx: Ctx, cx: number, cy: number, r: number, fill: string) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.42, cy + r * 0.02);
  ctx.lineTo(cx - r * 0.1, cy + r * 0.34);
  ctx.lineTo(cx + r * 0.46, cy - r * 0.3);
  ctx.stroke();
  ctx.restore();
}

/** A pill with text in it, with its left (or right) edge at x. Returns its size so the caller can stack things beside it. */
function pill(ctx: Ctx, text: string, x: number, y: number, size: number, bg: string, fg: string, weight = 800, alignRight = false) {
  font(ctx, weight, size);
  const padX = size * 0.8;
  const h = size * 1.95;
  const w = ctx.measureText(text).width + padX * 2;
  const left = alignRight ? x - w : x;
  ctx.fillStyle = bg;
  rounded(ctx, { x: left, y, w, h }, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(text, left + padX, y + h / 2 + size * 0.04);
  return { w, h };
}

/** The place with a pin, on one line starting at x (or centred on it). */
function placeLine(env: Env, x: number, y: number, size: number, centred: boolean, color = "rgba(255,255,255,0.95)") {
  const { ctx, ad } = env;
  const text = fit(ctx, shortPlace(ad.listing.location), textWidth(env) - size * 2, 1, size, size * 0.72, 700);
  font(ctx, 700, text.size);
  const line = text.lines[0] ?? "";
  const w = ctx.measureText(line).width + text.size * 1.3;
  const left = centred ? x - w / 2 : x;
  pin(ctx, left, y + text.size * 0.05, text.size, SUN);
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(line, left + text.size * 1.3, y + text.size * 0.95);
  return text.size * 1.3;
}

/** One segment per clip across the top, filling as the ad plays: it tells the viewer how much is left, which keeps them watching. */
function progress(env: Env, scene: Scene, local: number) {
  const { ctx, W, u, pad, tl } = env;
  const clips = tl.scenes.filter((s) => s.kind === "photo");
  const gap = u * 1.1;
  const segW = (W - pad.x * 2 - gap * (clips.length - 1)) / clips.length;
  const y = pad.top - u * 3.4;
  clips.forEach((clip, i) => {
    const done = scene.kind === "intro" ? 0 : scene.kind === "outro" || i < scene.index ? 1 : i === scene.index ? clamp01(local / lengthOf(clip)) : 0;
    const x = pad.x + i * (segW + gap);
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    rounded(ctx, { x, y, w: segW, h: u * 0.9 }, u * 0.45);
    ctx.fill();
    if (done > 0) {
      ctx.fillStyle = SUN;
      rounded(ctx, { x, y, w: Math.max(u * 0.9, segW * done), h: u * 0.9 }, u * 0.45);
      ctx.fill();
    }
  });
}

// ---------------------------------------------------------------- big words

/** The words of a caption worth a second look: a number or an amount (with the word it counts), otherwise the longest word. */
function keyWords(words: string[]): Set<number> {
  const keys = new Set<number>();
  words.forEach((w, i) => {
    if (!/\d/.test(w)) return;
    keys.add(i);
    // A bare count takes the word it counts with it: "2 cars", "15 min".
    if (/^\d{1,3}$/.test(w) && i + 1 < words.length) keys.add(i + 1);
  });
  if (keys.size === 0 && words.length > 1) {
    let best = -1;
    words.forEach((w, i) => {
      if (w.replace(/[^\p{L}]/gu, "").length >= 4 && (best < 0 || w.length > words[best]!.length)) best = i;
    });
    if (best >= 0) keys.add(best);
  }
  return keys;
}

type Words = {
  /** Centre of the text block, and the edge it is placed from. */
  cx: number;
  y: number;
  anchor: "top" | "bottom" | "middle";
  maxW: number;
  maxLines: number;
  size: number;
  min: number;
  weight?: number;
  family?: string;
  fill?: string;
  /** The colour of the key words. */
  key?: string;
  /** Put the key words on a block of the key colour instead of colouring the letters. */
  keyBlock?: boolean;
  outline?: boolean;
  align?: "center" | "left";
  leading?: number;
  /** When the first word comes in, and how long after it each next word follows. A negative start shows every word from the first frame. */
  start?: number;
  stagger?: number;
};

/**
 * Large text, word by word. Each word pops in, and the key words take the
 * accent colour, so the caption reads at a glance with the sound off. Returns
 * the block's top and bottom.
 */
function words(env: Env, text: string, local: number, o: Words) {
  const { ctx, u } = env;
  const weight = o.weight ?? 800;
  const family = o.family ?? SANS;
  const fitted = fit(ctx, text, o.maxW, o.maxLines, o.size, o.min, weight, family);
  const size = fitted.size;
  const leading = size * (o.leading ?? 1.16);
  const blockH = fitted.lines.length * leading;
  const top = o.anchor === "top" ? o.y : o.anchor === "bottom" ? o.y - blockH : o.y - blockH / 2;
  const all = fitted.lines.flatMap((l) => l.split(" "));
  const keys = o.key ? keyWords(all) : new Set<number>();
  const start = o.start ?? 0.12;
  const stagger = o.stagger ?? 0.07;
  font(ctx, weight, size, family);
  const space = ctx.measureText(" ").width;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  let n = 0;
  fitted.lines.forEach((line, row) => {
    const parts = line.split(" ");
    const widths = parts.map((w) => ctx.measureText(w).width);
    const lineW = widths.reduce((a, b) => a + b, 0) + space * (parts.length - 1);
    let x = o.align === "left" ? o.cx : o.cx - lineW / 2;
    const base = top + row * leading + size * 0.86;
    parts.forEach((word, k) => {
      const i = n++;
      const a = start < 0 ? 1 : clamp01((local - start - i * stagger) / 0.16);
      const w = widths[k]!;
      if (a > 0) {
        const s = start < 0 ? 1 : 0.6 + 0.4 * backOut(a);
        ctx.save();
        ctx.globalAlpha *= Math.min(1, a * 1.8);
        ctx.translate(x + w / 2, base - size * 0.32);
        ctx.scale(s, s);
        const isKey = keys.has(i);
        if (isKey && o.keyBlock) {
          ctx.fillStyle = o.key!;
          rounded(ctx, { x: -w / 2 - size * 0.16, y: -size * 0.62, w: w + size * 0.32, h: size * 1.2 }, size * 0.2);
          ctx.fill();
          ctx.fillStyle = NAVY;
        } else {
          if (o.outline !== false) {
            ctx.strokeStyle = INK;
            ctx.lineWidth = size * 0.17;
            ctx.strokeText(word, -w / 2, size * 0.32);
          }
          ctx.fillStyle = isKey ? o.key! : (o.fill ?? "#ffffff");
        }
        ctx.shadowColor = "rgba(4,10,30,0.45)";
        ctx.shadowBlur = isKey && o.keyBlock ? 0 : u * 1.4;
        ctx.shadowOffsetY = isKey && o.keyBlock ? 0 : u * 0.3;
        ctx.fillText(word, -w / 2, size * 0.32);
        ctx.restore();
      }
      x += w + space;
    });
  });
  return { top, bottom: top + blockH, size, lines: fitted.lines.length };
}

/** Where a caption's bottom edge sits: above the buttons apps draw over a vertical video. */
const captionBottom = (env: Env) => env.H - env.pad.bottom;

/**
 * The property is what sells, so the words keep to the lower part of the frame,
 * at a size that reads at a glance and no larger, and only that part is
 * darkened. Sizes are in units of `u`.
 */
const HOOK = { size: 7.8, min: 5, lines: 3 } as const;
const CAPTION = { size: 6.6, min: 4.4, lines: 2 } as const;
/** How far down the frame the shade under the words starts, and how dark it gets at the bottom edge. */
const SHADE = { hook: 0.5, caption: 0.62, top: 0.13 } as const;

// ---------------------------------------------------------------- the closing card (shared)

type Closing = {
  bg: string;
  overlay: number;
  accent: string;
  family: string;
  align: "left" | "center";
  ctaBg: string;
  ctaFg: string;
  ctaOutline?: boolean;
  /** Price Reveal: the price is held back for a beat, and everything under it waits for it. */
  reveal?: boolean;
};

/**
 * The handoff: the price, the place, what it takes to get in, and one thing to
 * do next. Everything is in within about a second and then holds, so there is
 * time to read it.
 */
function closing(env: Env, scene: Scene, local: number, style: Closing) {
  const { ctx, W, H, u, tu, pad, ad } = env;
  photo(env, scene.photo, full(env), camera(scene, local, 1));
  ctx.save();
  ctx.fillStyle = style.bg;
  ctx.globalAlpha *= style.overlay;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // A band of the accent colour wipes across the top as the card lands.
  ctx.fillStyle = style.accent;
  ctx.fillRect(0, 0, W * easeOut(local / 0.45), u * 1.4);

  const centered = style.align === "center";
  const maxW = centered ? W - pad.x * 2 : textWidth(env);
  const x = centered ? W / 2 : pad.x;
  const l = ad.listing;
  const priceAt = style.reveal ? PRICE_AT.reveal : PRICE_AT.normal;
  const rows: Array<{ h: number; at: number; draw: (y: number, a: number) => void }> = [];
  const add = (h: number, at: number, draw: (y: number, a: number) => void) => rows.push({ h, at, draw });
  ctx.textAlign = centered ? "center" : "left";

  const name = fit(ctx, l.name, maxW, 2, tu * 4.8, tu * 3.2, 700, style.family);
  add(name.lines.length * name.size * 1.2 + tu * 1.4, 0.08, (y) => {
    font(ctx, 700, name.size, style.family);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    name.lines.forEach((t, i) => ctx.fillText(t, x, y + (i + 0.85) * name.size * 1.2));
  });

  // The price is the biggest thing on the card and lands with a pop.
  const priceText = l.status === "reserved" ? `${l.price} · Reserved` : l.price;
  const price = fit(ctx, priceText, maxW, 1, u * 17, u * 6.5, 800, style.family);
  add(price.size * 1.2 + u * 1.4, -1, (y) => {
    font(ctx, 800, price.size, style.family);
    const shown = price.lines[0] ?? priceText;
    const w = ctx.measureText(shown).width;
    const left = centered ? x - w / 2 : x;
    const a = clamp01((local - priceAt) / 0.22);
    if (style.reveal && a < 1) {
      // Until the price lands its place is held, so the viewer knows it is coming. It is the listing's real price, never a count-up through other numbers.
      ctx.save();
      ctx.globalAlpha *= 1 - a;
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      rounded(ctx, { x: left, y: y + price.size * 0.12, w, h: price.size * 1.0 }, price.size * 0.2);
      ctx.fill();
      font(ctx, 800, price.size * 0.5, style.family);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.textAlign = "center";
      ctx.fillText("₱ ?", left + w / 2, y + price.size * 0.8);
      ctx.restore();
    }
    if (a <= 0) return;
    const s = 0.7 + 0.3 * backOut(a);
    ctx.save();
    ctx.globalAlpha *= Math.min(1, a * 2);
    ctx.translate(left + w / 2, y + price.size * 0.62);
    ctx.scale(s, s);
    font(ctx, 800, price.size, style.family);
    ctx.textAlign = "center";
    ctx.fillStyle = style.accent;
    ctx.fillText(shown, 0, price.size * 0.33);
    ctx.restore();
  });

  const after = priceAt + 0.18;
  const place = fit(ctx, l.location, maxW - tu * 5, 2, tu * 4, tu * 3, 500);
  add(place.lines.length * place.size * 1.3 + tu * 2.2, after, (y) => {
    font(ctx, 500, place.size);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    const first = place.lines[0] ?? "";
    const w = ctx.measureText(first).width;
    const px = centered ? x - w / 2 - place.size * 1.25 : x;
    pin(ctx, px, y + place.size * 0.12, place.size * 0.95, style.accent);
    place.lines.forEach((t, i) => ctx.fillText(t, centered ? x + place.size * 0.5 : x + place.size * 1.3, y + (i + 0.9) * place.size * 1.3));
  });

  // What it takes to get in, as tags: the owner's own financing and fees.
  const tags = termsOf(l);
  if (tags.length) {
    const size = tu * 3.4;
    font(ctx, 700, size);
    const padX = size * 0.85;
    const tagH = size * 2;
    const gap = size * 0.55;
    const widths = tags.map((t) => ctx.measureText(t).width + padX * 2);
    const lines: number[][] = [[]];
    let used = 0;
    widths.forEach((w, i) => {
      if (used > 0 && used + gap + w > maxW) {
        lines.push([]);
        used = 0;
      }
      lines[lines.length - 1]!.push(i);
      used += (used > 0 ? gap : 0) + w;
    });
    add(lines.length * (tagH + gap) + tu * 2.2, after + 0.12, (y) => {
      lines.forEach((line, r) => {
        const lineW = line.reduce((n, i) => n + widths[i]!, 0) + gap * (line.length - 1);
        let tx = centered ? x - lineW / 2 : x;
        line.forEach((i, k) => {
          const a = clamp01((local - after - 0.12 - (r * 2 + k) * 0.06) / 0.2);
          ctx.save();
          ctx.globalAlpha *= a;
          ctx.fillStyle = "rgba(255,255,255,0.14)";
          rounded(ctx, { x: tx, y: y + r * (tagH + gap), w: widths[i]!, h: tagH }, tagH / 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.45)";
          ctx.lineWidth = Math.max(1.5, u * 0.16);
          ctx.stroke();
          font(ctx, 700, size);
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(tags[i]!, tx + padX, y + r * (tagH + gap) + tagH / 2 + size * 0.04);
          ctx.restore();
          tx += widths[i]! + gap;
        });
      });
      ctx.textBaseline = "alphabetic";
    });
  }

  if (ad.text.cta) {
    const cta = fitShort(ctx, ad.text.cta, maxW - tu * 7, tu * 5.2, tu * 3.4, 800, tu * 4.4);
    const boxH = cta.lines.length * cta.size * 1.25 + cta.size * 1.4;
    const at = after + 0.32;
    add(boxH + tu * 3.2, at, (y) => {
      font(ctx, 800, cta.size);
      const w = Math.max(...cta.lines.map((t) => ctx.measureText(t).width)) + cta.size * 2.6;
      const bx = centered ? x - w / 2 : x;
      // Once it's in, the button breathes: the one thing on the card that keeps moving is the thing to press.
      const beat = Math.max(0, local - at - 0.5);
      const pulse = 1 + 0.035 * Math.sin((beat / (env.tl.beat * 2)) * Math.PI * 2);
      ctx.save();
      ctx.translate(bx + w / 2, y + boxH / 2);
      ctx.scale(pulse, pulse);
      rounded(ctx, { x: -w / 2, y: -boxH / 2, w, h: boxH }, Math.min(boxH / 2, cta.size * 1.7));
      if (style.ctaOutline) {
        ctx.strokeStyle = style.ctaBg;
        ctx.lineWidth = Math.max(2, u * 0.3);
        ctx.stroke();
      } else {
        ctx.fillStyle = style.ctaBg;
        ctx.fill();
      }
      ctx.fillStyle = style.ctaFg;
      ctx.textAlign = "center";
      cta.lines.forEach((t, i) => ctx.fillText(t, 0, -boxH / 2 + cta.size * 0.7 + (i + 0.82) * cta.size * 1.25));
      ctx.restore();
    });
  }
  const biz = fit(ctx, l.business, maxW, 1, tu * 3.6, tu * 2.6, 600);
  add(biz.size * 1.4, after + 0.42, (y) => {
    font(ctx, 600, biz.size);
    ctx.fillStyle = "rgba(255,255,255,0.84)";
    ctx.fillText(biz.lines[0] ?? "", x, y + biz.size);
  });

  const total = rows.reduce((n, r) => n + r.h, 0);
  const room = H - pad.top - pad.bottom;
  let y = pad.top + Math.max(0, (room - total) / 2);
  ctx.textBaseline = "alphabetic";
  rows.forEach((row) => {
    // The price row draws its own entrance.
    const e = row.at < 0 ? { a: 1, rise: 0 } : enter(local, row.at, 0.3);
    ctx.save();
    ctx.globalAlpha *= e.a;
    ctx.textAlign = centered ? "center" : "left";
    row.draw(y + e.rise * u * 3, e.a);
    ctx.restore();
    y += row.h;
  });
}

// ---------------------------------------------------------------- Showcase

function showcase(env: Env, scene: Scene, local: number) {
  const { ctx, W, u, tu, pad, ad } = env;
  if (scene.kind === "outro") return closing(env, scene, local, { bg: DEEP, overlay: 0.86, accent: SUN, family: SANS, align: "center", ctaBg: SUN, ctaFg: NAVY });
  photo(env, scene.photo, full(env), camera(scene, local, 1));
  const maxW = textWidth(env);

  const tag = ad.listing.status === "reserved" ? "Reserved" : "For Sale";
  if (scene.kind === "intro") {
    // The headline is on screen from the very first frame, under the photo's subject: the photo is what stops a scroll.
    wash(env, SHADE.hook, 1, DEEP, 0.7);
    wash(env, SHADE.top, 0, DEEP, 0.28);
    pill(ctx, tag, pad.x, pad.top, tu * 3.7, SUN, NAVY);
    const block = words(env, ad.text.hook, local, { cx: W / 2, y: captionBottom(env), anchor: "bottom", maxW, maxLines: HOOK.lines, size: u * HOOK.size, min: u * HOOK.min, key: SUN, start: -1 });
    const e = enter(local, 0.3);
    ctx.save();
    ctx.globalAlpha *= e.a;
    placeLine(env, W / 2, block.top - tu * 6 - e.rise * u * 2, tu * 3.4, true);
    ctx.restore();
    return;
  }
  // A clip: the price stays in the corner for anyone who joins late, the caption comes in word by word along the bottom.
  wash(env, SHADE.caption, 1, DEEP, 0.6);
  wash(env, SHADE.top, 0, DEEP, 0.28);
  pill(ctx, shortPrice(ad.listing), pad.x, pad.top, tu * 3.7, "#ffffff", NAVY);
  if (scene.line) words(env, scene.line, local, { cx: W / 2, y: captionBottom(env), anchor: "bottom", maxW, maxLines: CAPTION.lines, size: u * CAPTION.size, min: u * CAPTION.min, key: SUN, start: CAPTION_AT });
}

// ---------------------------------------------------------------- Bold Deal

/** Text on tight blocks of colour, tilted a little, each line slamming in after the one above: the look of a hand-made social caption. */
function blocks(env: Env, lines: string[], size: number, x: number, edge: number, bg: string, fg: string, tilt: number, local: number, start: number, fromTop = false) {
  const { ctx } = env;
  font(ctx, 800, size);
  const h = size * 1.42;
  const step = h + size * 0.08;
  ctx.save();
  ctx.translate(x, edge);
  ctx.rotate(tilt);
  lines.forEach((t, i) => {
    const a = start < 0 ? 1 : clamp01((local - start - i * 0.09) / 0.16);
    if (a <= 0) return;
    const y = fromTop ? i * step : -(lines.length - i) * step;
    const w = ctx.measureText(t).width + size * 0.9;
    const s = start < 0 ? 1 : 1.5 - 0.5 * easeOut(a);
    ctx.save();
    ctx.globalAlpha *= Math.min(1, a * 2);
    ctx.translate(w / 2, y + h / 2);
    ctx.scale(s, s);
    ctx.fillStyle = bg;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = fg;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(t, -w / 2 + size * 0.45, size * 0.05);
    ctx.restore();
  });
  ctx.restore();
  return lines.length * step;
}

function bold(env: Env, scene: Scene, local: number) {
  const { ctx, W, u, tu, pad, ad, tl, t } = env;
  if (scene.kind === "outro") closing(env, scene, local, { bg: BLUE, overlay: 0.9, accent: SUN, family: SANS, align: "left", ctaBg: "#ffffff", ctaFg: NAVY });
  else {
    photo(env, scene.photo, full(env), camera(scene, local, 1.35));
    const maxW = textWidth(env) - u * 4;
    // A tilted sticker in the corner: the price, riding along through every clip.
    const sticker = (label: string, a: number) => {
      if (a <= 0) return;
      ctx.save();
      ctx.globalAlpha *= Math.min(1, a * 2);
      ctx.translate(pad.x, pad.top);
      ctx.rotate(-0.035);
      const grow = 1.5 - 0.5 * easeOut(a);
      ctx.scale(grow, grow);
      font(ctx, 800, tu * 4.6);
      const pw = ctx.measureText(label).width + tu * 4;
      ctx.fillStyle = SUN;
      ctx.fillRect(0, 0, pw, tu * 7.2);
      ctx.fillStyle = NAVY;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(label, tu * 2, tu * 3.8);
      ctx.restore();
    };
    wash(env, scene.kind === "intro" ? SHADE.hook : SHADE.caption, 1, DEEP, 0.55);
    if (scene.kind === "intro") {
      // Headline from the first frame, along the bottom. The price slams into the corner, unless the headline already says it: then the place does.
      const hook = fit(ctx, ad.text.hook.toUpperCase(), maxW, HOOK.lines, u * 7.4, u * 4.8, 800);
      blocks(env, hook.lines, hook.size, pad.x, captionBottom(env), NAVY, "#ffffff", -0.035, local, -1);
      sticker(amountsIn(ad.text.hook).length ? shortPlace(ad.listing.location).toUpperCase() : shortPrice(ad.listing), clamp01((local - 0.32) / 0.16));
    } else {
      sticker(shortPrice(ad.listing), 1);
      if (scene.line) {
        const cap = fit(ctx, scene.line.toUpperCase(), maxW, CAPTION.lines, u * 6.8, u * 4.6, 800);
        blocks(env, cap.lines, cap.size, pad.x, captionBottom(env), "#ffffff", NAVY, -0.035, local, 0.1);
      }
    }
  }
  // A bar across the top fills as the video plays.
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(0, 0, W, u * 1.2);
  ctx.fillStyle = SUN;
  ctx.fillRect(0, 0, W * clamp01(t / tl.duration), u * 1.2);
  ctx.restore();
}

// ---------------------------------------------------------------- Elegant

function spaced(ctx: Ctx, em: number) {
  // Letter spacing on canvas text is newer than the rest; where it's missing the text is simply set normally.
  if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${em}px`;
}

function elegant(env: Env, scene: Scene, local: number) {
  const { ctx, W, H, u, tu, pad, ad } = env;
  if (scene.kind === "outro") {
    closing(env, scene, local, { bg: "#0b0b0d", overlay: 0.9, accent: GOLD, family: SERIF, align: "center", ctaBg: GOLD, ctaFg: "#ffffff", ctaOutline: true });
    ctx.save();
    ctx.strokeStyle = "rgba(216,180,106,0.55)";
    ctx.lineWidth = Math.max(1.5, u * 0.18);
    ctx.strokeRect(pad.x * 0.55, pad.top * 0.55, W - pad.x * 1.1, H - (pad.top + pad.bottom) * 0.55);
    ctx.restore();
    return;
  }
  // The photograph fills the frame and moves slowly; the words are few and quiet.
  photo(env, scene.photo, full(env), camera(scene, local, 0.6));
  ctx.textAlign = "center";
  if (scene.kind === "intro") {
    wash(env, SHADE.hook - 0.06, 1, "#0b0b0d", 0.86);
    const rise = (1 - easeOut(local / 1.1)) * u * 2;
    const base = captionBottom(env);
    const block = words(env, ad.text.hook, local, { cx: W / 2, y: base - tu * 5.6 + rise, anchor: "bottom", maxW: W - pad.x * 2.4, maxLines: HOOK.lines, size: u * 7.4, min: u * 4.8, weight: 500, family: SERIF, key: GOLD, outline: false, start: -1, leading: 1.14 });
    ctx.fillStyle = GOLD;
    ctx.fillRect(W / 2 - u * 6, block.top - u * 3.4, u * 12 * easeOut(local / 0.7), Math.max(1.5, u * 0.24));
    const e = enter(local, 0.4, 0.6);
    ctx.save();
    ctx.globalAlpha *= e.a;
    font(ctx, 600, tu * 2.9);
    spaced(ctx, tu * 0.4);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(shortPlace(ad.listing.location).toUpperCase(), W / 2, base - tu * 0.6);
    spaced(ctx, 0);
    ctx.restore();
    return;
  }
  wash(env, SHADE.caption - 0.04, 1, "#0b0b0d", 0.8);
  wash(env, SHADE.top + 0.05, 0, "#0b0b0d", 0.55);
  // The price sits small at the top; the caption fades up along the bottom, under the photograph's subject.
  font(ctx, 500, tu * 4, SERIF);
  ctx.fillStyle = GOLD;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  ctx.fillText(shortPrice(ad.listing), W / 2, pad.top + tu * 3.4);
  if (!scene.line) return;
  const e = enter(local, 0.3, 0.7);
  ctx.save();
  ctx.globalAlpha *= e.a;
  const block = words(env, scene.line, local, { cx: W / 2, y: captionBottom(env) + e.rise * u * 2, anchor: "bottom", maxW: W - pad.x * 2.4, maxLines: CAPTION.lines, size: u * 6.2, min: u * 4.4, weight: 500, family: SERIF, outline: false, start: -1, leading: 1.18 });
  ctx.fillStyle = GOLD;
  ctx.fillRect(W / 2 - u * 4, block.top - u * 2.4, u * 8, Math.max(1.5, u * 0.22));
  ctx.restore();
}

// ---------------------------------------------------------------- Fact Sheet

function facts(env: Env, scene: Scene, local: number) {
  const { ctx, W, H, u, tu, pad, ad } = env;
  if (scene.kind === "outro") return closing(env, scene, local, { bg: NAVY, overlay: 0.93, accent: SUN, family: SANS, align: "left", ctaBg: SUN, ctaFg: NAVY });
  // Vertical: the photo above the facts. Square and wide: side by side.
  const stacked = ad.shape === "vertical";
  // The photo takes the larger part of the frame; the facts get what they need to be read and no more.
  const pic: Rect = stacked ? { x: 0, y: 0, w: W, h: H * 0.52 } : { x: 0, y: 0, w: W * (ad.shape === "wide" ? 0.58 : 0.5), h: H };
  const panel: Rect = stacked ? { x: 0, y: pic.h, w: W, h: H - pic.h } : { x: pic.w, y: 0, w: W - pic.w, h: H };
  // The panel stays put from scene to scene; only the photo changes, with a quick punch on the cut.
  const cam = camera(scene, local, 0.9);
  const punch = scene.kind === "photo" ? 0.14 * (1 - easeOut(local / 0.3)) : 0;
  photo(env, scene.photo, { ...pic, h: pic.h + (stacked ? u * 4 : 0) }, { ...cam, zoom: cam.zoom + punch });
  if (scene.kind === "photo" && local < 0.12) {
    ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - local / 0.12)})`;
    ctx.fillRect(pic.x, pic.y, pic.w, pic.h);
  }
  ctx.fillStyle = NAVY;
  if (stacked) {
    rounded(ctx, { x: panel.x, y: panel.y, w: panel.w, h: panel.h + u * 6 }, u * 4);
    ctx.fill();
  } else ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  const x = panel.x + (stacked ? pad.x : u * 5);
  const maxW = panel.w - (stacked ? pad.x * 2 : u * 10);
  const top = panel.y + (stacked ? u * 5 : pad.top);
  const bottom = H - (stacked ? pad.bottom * 0.72 : pad.bottom);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const price = fit(ctx, ad.listing.price, maxW, 1, tu * (stacked ? 6.4 : 7.6), tu * 4.6, 800);
  font(ctx, 800, price.size);
  ctx.fillStyle = SUN;
  ctx.fillText(price.lines[0] ?? "", x, top + price.size * 0.9);
  let y = top + price.size * 1.2;
  // The headline while the ad opens (and beside the photo, where there is room); after that the space goes to the facts.
  if (scene.kind === "intro" || !stacked) {
    // Under the photo there is room for the headline alone while the ad opens, so it is set larger there.
    const opening = stacked && scene.kind === "intro";
    const title = fit(ctx, scene.kind === "intro" ? ad.text.hook : ad.listing.name, maxW, opening ? 3 : 2, tu * (opening ? 4.8 : 4), tu * 2.9, 700);
    font(ctx, 700, title.size);
    ctx.fillStyle = "#ffffff";
    title.lines.forEach((t, i) => ctx.fillText(t, x, y + (i + 0.9) * title.size * 1.2));
    y += title.lines.length * title.size * 1.2 + tu * 1;
  } else y += tu * 0.6;
  // Under the photo the place is named while the ad opens; after that its room goes to the facts (the closing card names it again).
  if (scene.kind === "intro" || !stacked) y += placeLine(env, x, y, tu * 3, false, "rgba(255,255,255,0.82)") + tu * 1.6;
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(x, y, maxW, Math.max(1.5, u * 0.18));
  y += tu * 1.6;

  // Every fact has its place, faint, and ticks on in its own scene. Under the photo four are shown at a time, moving on with the ad.
  const all = env.tl.scenes.filter((s) => s.kind === "photo" && s.line).map((s) => s.line!);
  if (!all.length || (stacked && scene.kind === "intro")) return;
  const shown = stacked ? Math.min(4, all.length) : all.length;
  const first = stacked && scene.kind === "photo" ? Math.max(0, Math.min(scene.index - (shown - 2), all.length - shown)) : 0;
  const row = Math.min(tu * 9.5, (bottom - y) / shown);
  const size = Math.min(tu * 4.6, row * 0.5);
  all.slice(first, first + shown).forEach((text, k) => {
    const i = first + k;
    const now = scene.kind === "photo" && i === scene.index;
    const lit = scene.kind === "intro" ? 0 : i < scene.index ? 1 : now ? clamp01((local - 0.1) / 0.2) : 0;
    const cy = y + row * (k + 0.5);
    // One line where it fits; two smaller lines only if the row is tall enough for them.
    const fitted = fitShort(ctx, text, maxW - size * 2.3, size, size * 0.72, 700, Math.min(size * 0.8, row / 2.6));
    if (now && lit > 0) {
      // The fact being shown now sits on a lighter band.
      ctx.save();
      ctx.globalAlpha *= 0.14 * lit;
      ctx.fillStyle = "#ffffff";
      rounded(ctx, { x: x - size * 0.5, y: cy - row * 0.44, w: maxW + size, h: row * 0.88 }, size * 0.7);
      ctx.fill();
      ctx.restore();
    }
    const drawRow = (alpha: number, filled: boolean) => {
      ctx.save();
      ctx.globalAlpha *= alpha;
      if (filled) check(ctx, x + size * 0.7, cy, size * 0.7 * (now ? 0.6 + 0.4 * backOut(lit) : 1), "#2f7af5");
      else {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1.5, size * 0.09);
        ctx.beginPath();
        ctx.arc(x + size * 0.7, cy, size * 0.62, 0, Math.PI * 2);
        ctx.stroke();
      }
      font(ctx, 700, fitted.size);
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      fitted.lines.forEach((t, k) => ctx.fillText(t, x + size * 2.1, cy + (k - (fitted.lines.length - 1) / 2) * fitted.size * 1.15 + fitted.size * 0.05));
      ctx.restore();
    };
    if (lit < 1) drawRow(0.26 * (1 - lit), false);
    if (lit > 0) drawRow(lit, true);
  });
}

// ---------------------------------------------------------------- Price Reveal

function reveal(env: Env, scene: Scene, local: number) {
  const { ctx, W, u, tu, pad, ad } = env;
  if (scene.kind === "outro") return closing(env, scene, local, { bg: DEEP, overlay: 0.9, accent: SUN, family: SANS, align: "center", ctaBg: SUN, ctaFg: NAVY, reveal: true });
  photo(env, scene.photo, full(env), camera(scene, local, 1.1));
  const maxW = textWidth(env);
  // The tag that promises the price stays on screen the whole way: it is the reason to keep watching.
  const tag = () => pill(ctx, "Guess the price", pad.x, pad.top, tu * 3.4, SUN, NAVY);
  wash(env, scene.kind === "intro" ? SHADE.hook : SHADE.caption, 1, DEEP, scene.kind === "intro" ? 0.7 : 0.6);
  wash(env, SHADE.top, 0, DEEP, 0.28);
  tag();
  if (scene.kind === "intro") words(env, ad.text.hook, local, { cx: W / 2, y: captionBottom(env), anchor: "bottom", maxW, maxLines: HOOK.lines, size: u * HOOK.size, min: u * HOOK.min, key: SUN, start: -1 });
  else if (scene.line) words(env, scene.line, local, { cx: W / 2, y: captionBottom(env), anchor: "bottom", maxW, maxLines: CAPTION.lines, size: u * CAPTION.size, min: u * CAPTION.min, key: SUN, keyBlock: true, start: CAPTION_AT });
}

// ---------------------------------------------------------------- Top 3 Reasons

function reasons(env: Env, scene: Scene, local: number) {
  const { ctx, W, u, tu, pad, ad, tl } = env;
  if (scene.kind === "outro") return closing(env, scene, local, { bg: NAVY, overlay: 0.9, accent: SUN, family: SANS, align: "center", ctaBg: SUN, ctaFg: NAVY });
  photo(env, scene.photo, full(env), camera(scene, local, 0.9));
  const maxW = textWidth(env);
  const count = tl.scenes.filter((s) => s.kind === "photo").length;

  wash(env, scene.kind === "intro" ? SHADE.hook : SHADE.caption - 0.06, 1, NAVY, 0.7);
  wash(env, SHADE.top + 0.03, 0, NAVY, 0.36);
  progress(env, scene, local);
  if (scene.kind === "intro") {
    pill(ctx, count === 1 ? "The reason to see it" : `${count} reasons to see it`, pad.x, pad.top, tu * 3.4, SUN, NAVY);
    words(env, ad.text.hook, local, { cx: W / 2, y: captionBottom(env), anchor: "bottom", maxW, maxLines: HOOK.lines, size: u * HOOK.size, min: u * HOOK.min, key: SUN, start: -1 });
    return;
  }
  pill(ctx, shortPrice(ad.listing), pad.x, pad.top, tu * 3.7, "#ffffff", NAVY);
  // The number slams in, then the reason reads out beside it (wide) or under it.
  const text = scene.line ?? ad.listing.name;
  const beside = ad.shape === "wide";
  const numSize = u * (beside ? 15 : 14);
  font(ctx, 800, numSize);
  const digit = String(scene.index + 1);
  const numW = ctx.measureText(digit).width;
  const bottom = captionBottom(env);
  const reasonW = beside ? maxW - numW - u * 5 : maxW;
  const probe = fit(ctx, text, reasonW, CAPTION.lines, u * CAPTION.size, u * CAPTION.min, 800);
  const textH = probe.lines.length * probe.size * 1.16;
  const a = clamp01((local - 0.06) / 0.2);
  const s = 1.6 - 0.6 * easeOut(a);
  const nx = beside ? pad.x : W / 2 - numW / 2;
  const ny = beside ? bottom : bottom - textH - u * 1;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, a * 2);
  ctx.translate(nx + numW / 2, ny - numSize * 0.36);
  ctx.scale(s, s);
  font(ctx, 800, numSize);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = numSize * 0.08;
  ctx.strokeText(digit, 0, numSize * 0.36);
  ctx.fillStyle = SUN;
  ctx.fillText(digit, 0, numSize * 0.36);
  ctx.restore();
  if (beside) words(env, text, local, { cx: pad.x + numW + u * 5, y: bottom, anchor: "bottom", maxW: reasonW, maxLines: CAPTION.lines, size: u * CAPTION.size, min: u * CAPTION.min, align: "left", start: 0.24 });
  else words(env, text, local, { cx: W / 2, y: bottom, anchor: "bottom", maxW: reasonW, maxLines: CAPTION.lines, size: u * CAPTION.size, min: u * CAPTION.min, start: 0.24 });
}

const DRAW: Record<TemplateId, (env: Env, scene: Scene, local: number) => void> = { showcase, bold, elegant, facts, reveal, reasons };

// ---------------------------------------------------------------- cuts

/**
 * How one scene gives way to the next, over the first `cut` seconds of the new
 * one. Hard and quick, on the beat: a punch (the new scene lands slightly
 * zoomed and snaps back, with a flash), a push sideways or upward, or, for the
 * quiet template only, a dissolve.
 */
type Cut = "punch" | "left" | "up" | "fade" | "none";
const CUTS: Record<TemplateId, Cut[]> = {
  showcase: ["punch", "left"],
  bold: ["left", "up"],
  elegant: ["fade"],
  facts: ["none"],
  reveal: ["punch", "punch", "left"],
  reasons: ["up"],
};
const cutFor = (template: TemplateId, scene: Scene, index: number): Cut => {
  const list = CUTS[template];
  if (scene.kind === "outro") return template === "elegant" ? "fade" : "up";
  return list[index % list.length]!;
};

/** Draw the ad as it looks at time t (seconds). */
export function drawFrame(ctx: Ctx, ad: RenderAd, timeline: Timeline, t: number) {
  const { width: W, height: H } = SHAPES[ad.shape];
  const u = Math.min(W, H) / 100;
  const vertical = ad.shape === "vertical";
  const env: Env = { ctx, W, H, u, tu: u * (vertical ? 1.3 : ad.shape === "wide" ? 1.2 : 1), pad: { x: u * (vertical ? 7 : 6), top: vertical ? H * 0.11 : u * 7, bottom: vertical ? H * 0.2 : u * 9 }, ad, tl: timeline, t };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const time = Math.max(0, Math.min(timeline.duration - 1e-4, t));
  const { index, scene, local } = sceneAt(timeline, time);
  const draw = (s: Scene, at: number, place?: () => void) => {
    ctx.save();
    place?.();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    ctx.shadowColor = "transparent";
    DRAW[ad.template](env, s, at);
    ctx.restore();
  };
  const cut = index > 0 && local < timeline.cut ? cutFor(ad.template, scene, index) : "none";
  if (cut === "none") draw(scene, local);
  else {
    const prev = timeline.scenes[index - 1]!;
    const p = clamp01(local / timeline.cut);
    const e = easeInOut(p);
    const before = lengthOf(prev) + local;
    if (cut === "fade") {
      draw(prev, before);
      draw(scene, local, () => (ctx.globalAlpha = e));
    } else if (cut === "left") {
      draw(prev, before, () => ctx.translate(-e * W, 0));
      draw(scene, local, () => ctx.translate((1 - e) * W, 0));
    } else if (cut === "up") {
      draw(prev, before, () => ctx.translate(0, -e * H));
      draw(scene, local, () => ctx.translate(0, (1 - e) * H));
    } else {
      // A hard cut that lands zoomed in and snaps back, under a flash that is gone in a few frames.
      const s = 1 + 0.1 * (1 - easeOut(p));
      draw(scene, local, () => {
        ctx.translate(W / 2, H / 2);
        ctx.scale(s, s);
        ctx.translate(-W / 2, -H / 2);
      });
      ctx.fillStyle = `rgba(255,255,255,${0.3 * (1 - p)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  ctx.restore();
}

export const timelineFor = (ad: Pick<RenderAd, "template" | "photos" | "text" | "picks">) => buildTimeline(ad.template, ad.photos.length, ad.text.lines, ad.picks);
