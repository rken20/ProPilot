/**
 * Draws one frame of a video ad on a canvas. The preview and the exported video
 * both call drawFrame, so what the owner sees is what the file contains.
 *
 * Photos are drawn as they are: cropped to fill the frame and moved slowly
 * (zoom and pan), never altered. Everything else is text and flat shapes.
 */
import { SHAPES, buildTimeline, scenesAt, shortPlace, type AdListing, type AdText, type Scene, type ShapeId, type TemplateId, type Timeline } from "./spec";

export type Photo = CanvasImageSource & { width: number; height: number };
export type RenderAd = { template: TemplateId; shape: ShapeId; listing: AdListing; text: AdText; photos: Photo[] };

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

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** How far an element has come in: `a` for opacity, `rise` for how much it still has to move (1 → 0). */
function enter(local: number, delay = 0.2, length = 0.5) {
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

/** Fill the rectangle with the photo (cropping the overflow), zoomed and panned for the slow camera move. */
function photo(env: Env, index: number, r: Rect, zoom: number, panX: number, panY: number) {
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
    const s = Math.max(r.w / img.width, r.h / img.height) * zoom;
    const dw = img.width * s;
    const dh = img.height * s;
    const ox = (dw - r.w) / 2;
    const oy = (dh - r.h) / 2;
    ctx.drawImage(img, r.x - ox + panX * ox, r.y - oy + panY * oy, dw, dh);
  }
  ctx.restore();
}

/** The slow zoom and drift for a scene. Neighbouring scenes move in opposite directions. */
function camera(scene: Scene, progress: number, strength: number) {
  const n = scene.kind === "intro" ? 0 : scene.kind === "outro" ? 5 : scene.index + 1;
  const dir = n % 2 === 0 ? 1 : -1;
  const p = easeInOut(clamp01(progress));
  return {
    zoom: 1.04 + 0.11 * strength * (dir > 0 ? p : 1 - p),
    panX: dir * (p - 0.5) * 0.9 * strength,
    panY: ((n % 3) - 1) * (p - 0.5) * 0.6 * strength,
  };
}

function pin(ctx: Ctx, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size * 0.4, size * 0.4, Math.PI, 0);
  ctx.quadraticCurveTo(x + size * 0.9, y + size * 0.72, x + size / 2, y + size * 1.05);
  ctx.quadraticCurveTo(x + size * 0.1, y + size * 0.72, x + size * 0.1, y + size * 0.4);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size * 0.4, size * 0.15, 0, Math.PI * 2);
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

/** A pill with text in it. Returns its size so the caller can stack things under it. */
function pill(ctx: Ctx, text: string, x: number, y: number, size: number, bg: string, fg: string, weight = 800, alignRight = false) {
  font(ctx, weight, size);
  const padX = size * 0.75;
  const h = size * 1.9;
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

function scrim(env: Env, from: number, color: string) {
  const { ctx, W, H } = env;
  const g = ctx.createLinearGradient(0, H * from, 0, H);
  g.addColorStop(0, `${color}00`);
  g.addColorStop(0.6, `${color}99`);
  g.addColorStop(1, `${color}e0`);
  ctx.fillStyle = g;
  ctx.fillRect(0, H * from, W, H * (1 - from));
}

const full = (env: Env): Rect => ({ x: 0, y: 0, w: env.W, h: env.H });
const textWidth = (env: Env) => (env.ad.shape === "wide" ? env.W * 0.6 : env.W - env.pad.x * 2);

/** Lines of text stacked upward from a bottom edge. Returns the y of the top line. */
function stackUp(ctx: Ctx, lines: string[], x: number, bottom: number, size: number, leading = 1.12) {
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  lines.forEach((l, i) => ctx.fillText(l, x, bottom - (lines.length - 1 - i) * size * leading));
  return bottom - lines.length * size * leading;
}

// ---------------------------------------------------------------- the closing card (shared)

type Closing = { bg: string; overlay: number; accent: string; family: string; align: "left" | "center"; ctaBg: string; ctaFg: string; ctaOutline?: boolean };

function closing(env: Env, scene: Scene, local: number, progress: number, style: Closing) {
  const { ctx, W, H, u, tu, pad, ad } = env;
  const cam = camera(scene, progress, 0.6);
  photo(env, scene.photo, full(env), cam.zoom, cam.panX, cam.panY);
  ctx.globalAlpha *= 1;
  ctx.save();
  ctx.fillStyle = style.bg;
  ctx.globalAlpha *= style.overlay;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const centered = style.align === "center";
  const maxW = centered ? W - pad.x * 2 : textWidth(env);
  const x = centered ? W / 2 : pad.x;
  const l = ad.listing;
  const rows: Array<{ h: number; draw: (y: number, a: number) => void }> = [];
  const add = (h: number, draw: (y: number, a: number) => void) => rows.push({ h, draw });
  ctx.textAlign = centered ? "center" : "left";

  const name = fit(ctx, l.name, maxW, 3, tu * 5.2, tu * 3.6, 700, style.family);
  add(name.lines.length * name.size * 1.18 + tu * 1.8, (y) => {
    font(ctx, 700, name.size, style.family);
    ctx.fillStyle = "#ffffff";
    name.lines.forEach((t, i) => ctx.fillText(t, x, y + (i + 0.85) * name.size * 1.18));
  });
  const priceText = l.status === "reserved" ? `${l.price} · Reserved` : l.price;
  const price = fit(ctx, priceText, maxW, 1, u * 12.5, u * 6, 800, style.family);
  add(price.size * 1.2 + u * 1.2, (y) => {
    font(ctx, 800, price.size, style.family);
    ctx.fillStyle = style.accent;
    ctx.fillText(price.lines[0] ?? priceText, x, y + price.size * 0.95);
  });
  const place = fit(ctx, l.location, maxW - tu * 5, 2, tu * 3.7, tu * 2.8, 500);
  add(place.lines.length * place.size * 1.3 + tu * 2.6, (y) => {
    font(ctx, 500, place.size);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    const first = place.lines[0] ?? "";
    const w = ctx.measureText(first).width;
    const px = centered ? x - w / 2 - place.size * 1.25 : x;
    pin(ctx, px, y + place.size * 0.12, place.size * 0.95, style.accent);
    place.lines.forEach((t, i) => ctx.fillText(t, centered ? x + place.size * 0.5 : x + place.size * 1.3, y + (i + 0.9) * place.size * 1.3));
  });
  if (l.financing.length) {
    const fin = fit(ctx, l.financing.join("  ·  "), maxW, 1, tu * 3.1, tu * 2.3, 600);
    add(fin.size * 1.5 + tu * 3, (y) => {
      font(ctx, 600, fin.size);
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.fillText(fin.lines[0] ?? "", x, y + fin.size);
    });
  }
  if (ad.text.cta) {
    const cta = fitShort(ctx, ad.text.cta, maxW - tu * 8, tu * 4.2, tu * 3, 800, tu * 3.8);
    const boxH = cta.lines.length * cta.size * 1.25 + cta.size * 1.3;
    add(boxH + tu * 3.4, (y) => {
      font(ctx, 800, cta.size);
      const w = Math.max(...cta.lines.map((t) => ctx.measureText(t).width)) + cta.size * 2.4;
      const bx = centered ? x - w / 2 : x;
      rounded(ctx, { x: bx, y, w, h: boxH }, Math.min(boxH / 2, cta.size * 1.6));
      if (style.ctaOutline) {
        ctx.strokeStyle = style.ctaBg;
        ctx.lineWidth = Math.max(2, u * 0.3);
        ctx.stroke();
      } else {
        ctx.fillStyle = style.ctaBg;
        ctx.fill();
      }
      ctx.fillStyle = style.ctaFg;
      cta.lines.forEach((t, i) => ctx.fillText(t, centered ? x : bx + cta.size * 1.2, y + cta.size * 0.65 + (i + 0.82) * cta.size * 1.25));
    });
  }
  const biz = fit(ctx, l.business, maxW, 1, tu * 3.3, tu * 2.4, 600);
  add(biz.size * 1.4, (y) => {
    font(ctx, 600, biz.size);
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fillText(biz.lines[0] ?? "", x, y + biz.size);
  });

  const total = rows.reduce((n, r) => n + r.h, 0);
  const room = H - pad.top - pad.bottom;
  let y = pad.top + Math.max(0, (room - total) / 2);
  ctx.textBaseline = "alphabetic";
  rows.forEach((row, i) => {
    const e = enter(local, 0.25 + i * 0.12, 0.5);
    ctx.save();
    ctx.globalAlpha *= e.a;
    ctx.textAlign = centered ? "center" : "left";
    row.draw(y + e.rise * u * 3, e.a);
    ctx.restore();
    y += row.h;
  });
}

// ---------------------------------------------------------------- Showcase

function showcase(env: Env, scene: Scene, local: number, progress: number) {
  const { ctx, H, u, tu, pad, ad } = env;
  if (scene.kind === "outro") return closing(env, scene, local, progress, { bg: DEEP, overlay: 0.84, accent: SUN, family: SANS, align: "left", ctaBg: SUN, ctaFg: NAVY });
  const cam = camera(scene, progress, 1);
  photo(env, scene.photo, full(env), cam.zoom, cam.panX, cam.panY);
  scrim(env, 0.5, DEEP);
  const maxW = textWidth(env);
  const bottom = H - pad.bottom;
  ctx.shadowColor = "rgba(4,12,36,0.45)";
  ctx.shadowBlur = u * 1.2;

  if (scene.kind === "intro") {
    const e = enter(local, 0.25);
    const place = fit(ctx, shortPlace(ad.listing.location), maxW - tu * 5, 1, tu * 3.9, tu * 2.8, 600);
    const hook = fit(ctx, ad.text.hook, maxW, 3, u * 9, u * 5, 800);
    ctx.save();
    ctx.globalAlpha *= e.a;
    const shift = e.rise * u * 4;
    font(ctx, 600, place.size);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    pin(ctx, pad.x, bottom - place.size * 0.95 + shift, place.size, SUN);
    ctx.fillText(place.lines[0] ?? "", pad.x + place.size * 1.35, bottom + shift);
    font(ctx, 800, hook.size);
    ctx.fillStyle = "#ffffff";
    const top = stackUp(ctx, hook.lines, pad.x, bottom - place.size * 2.1 + shift, hook.size);
    ctx.shadowColor = "transparent";
    // The label sits clear above the first line of the headline.
    pill(ctx, ad.listing.status === "reserved" ? "Reserved" : "For Sale", pad.x, top - tu * 3.1 * 1.9 - hook.size * 0.12, tu * 3.1, SUN, NAVY);
    ctx.restore();
    return;
  }
  // A photo scene: the price stays in the corner, the feature line sits at the bottom.
  ctx.save();
  ctx.shadowColor = "transparent";
  pill(ctx, ad.listing.price, pad.x, pad.top, tu * 3.6, "#ffffff", NAVY);
  ctx.restore();
  const text = scene.line ?? ad.listing.name;
  const e = enter(local, 0.3);
  const cap = fit(ctx, text, maxW - u * 3, 2, scene.line ? tu * 6.2 : tu * 4.4, tu * 3.6, scene.line ? 800 : 600);
  ctx.save();
  ctx.globalAlpha *= e.a;
  const shift = e.rise * u * 3;
  font(ctx, scene.line ? 800 : 600, cap.size);
  ctx.fillStyle = "#ffffff";
  const top = stackUp(ctx, cap.lines, pad.x + u * 2.4, bottom + shift, cap.size);
  ctx.shadowColor = "transparent";
  ctx.fillStyle = SUN;
  rounded(ctx, { x: pad.x, y: top + cap.size * 0.28, w: u * 0.9, h: bottom + shift - top - cap.size * 0.1 }, u * 0.45);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- Bold Deal

/** Text on tight blocks of colour, tilted a little: the look of a hand-made social caption. */
function blocks(env: Env, lines: string[], size: number, x: number, bottom: number, bg: string, fg: string, tilt: number) {
  const { ctx } = env;
  font(ctx, 800, size);
  const h = size * 1.42;
  ctx.save();
  ctx.translate(x, bottom);
  ctx.rotate(tilt);
  lines.forEach((t, i) => {
    const y = -(lines.length - i) * (h + size * 0.08);
    const w = ctx.measureText(t).width + size * 0.9;
    ctx.fillStyle = bg;
    ctx.fillRect(0, y, w, h);
    ctx.fillStyle = fg;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(t, size * 0.45, y + h / 2 + size * 0.05);
  });
  ctx.restore();
  return lines.length * (h + size * 0.08);
}

function bold(env: Env, scene: Scene, local: number, progress: number) {
  const { ctx, W, H, u, tu, pad, ad, tl, t } = env;
  if (scene.kind === "outro") closing(env, scene, local, progress, { bg: BLUE, overlay: 0.9, accent: SUN, family: SANS, align: "left", ctaBg: "#ffffff", ctaFg: NAVY });
  else {
    const cam = camera(scene, progress, 1.5);
    photo(env, scene.photo, full(env), cam.zoom, cam.panX, cam.panY);
    ctx.fillStyle = "rgba(6,16,46,0.22)";
    ctx.fillRect(0, 0, W, H);
    const maxW = textWidth(env) - u * 4;
    const bottom = H - pad.bottom;
    if (scene.kind === "intro") {
      const e = enter(local, 0.15, 0.35);
      const hook = fit(ctx, ad.text.hook, maxW, 4, u * 9.5, u * 5.2, 800);
      ctx.save();
      ctx.globalAlpha *= e.a;
      const used = blocks(env, hook.lines, hook.size, pad.x + e.rise * -u * 6, bottom, NAVY, "#ffffff", -0.035);
      const price = fit(ctx, ad.listing.price, maxW, 1, u * 8.5, u * 5, 800);
      blocks(env, [price.lines[0] ?? ad.listing.price], price.size, pad.x + u * 1.5, bottom - used - u * 2.5, SUN, NAVY, 0.03);
      ctx.restore();
    } else {
      const e = enter(local, 0.12, 0.3);
      ctx.save();
      ctx.translate(pad.x, pad.top);
      ctx.rotate(-0.03);
      font(ctx, 800, tu * 4.4);
      const pw = ctx.measureText(ad.listing.price).width + tu * 4;
      ctx.fillStyle = SUN;
      ctx.fillRect(0, 0, pw, tu * 7);
      ctx.fillStyle = NAVY;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(ad.listing.price, tu * 2, tu * 3.7);
      ctx.restore();
      const text = scene.line ?? ad.listing.name;
      const cap = fit(ctx, text, maxW, 3, tu * 7.4, tu * 4.2, 800);
      ctx.save();
      ctx.globalAlpha *= e.a;
      blocks(env, cap.lines, cap.size, pad.x + e.rise * -u * 5, bottom, "#ffffff", NAVY, -0.03);
      ctx.restore();
    }
  }
  // A bar across the top fills as the video plays.
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(0, 0, W, u * 1.1);
  ctx.fillStyle = SUN;
  ctx.fillRect(0, 0, W * clamp01(t / tl.duration), u * 1.1);
  ctx.restore();
}

// ---------------------------------------------------------------- Elegant

function spaced(ctx: Ctx, em: number) {
  // Letter spacing on canvas text is newer than the rest; where it's missing the text is simply set normally.
  if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${em}px`;
}

function elegant(env: Env, scene: Scene, local: number, progress: number) {
  const { ctx, W, H, u, tu, pad, ad } = env;
  if (scene.kind === "outro") {
    closing(env, scene, local, progress, { bg: "#0b0b0d", overlay: 0.9, accent: GOLD, family: SERIF, align: "center", ctaBg: GOLD, ctaFg: "#ffffff", ctaOutline: true });
    ctx.save();
    ctx.strokeStyle = "rgba(216,180,106,0.55)";
    ctx.lineWidth = Math.max(1.5, u * 0.18);
    ctx.strokeRect(pad.x * 0.55, pad.top * 0.55, W - pad.x * 1.1, H - (pad.top + pad.bottom) * 0.55);
    ctx.restore();
    return;
  }
  const bar = ad.shape === "vertical" ? H * 0.12 : H * 0.11;
  const frame: Rect = { x: 0, y: bar, w: W, h: H - bar * 2 };
  ctx.fillStyle = "#0b0b0d";
  ctx.fillRect(0, 0, W, H);
  const cam = camera(scene, progress, 0.65);
  photo(env, scene.photo, frame, cam.zoom, cam.panX, cam.panY);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (scene.kind === "intro") {
    ctx.fillStyle = "rgba(8,8,10,0.42)";
    ctx.fillRect(frame.x, frame.y, frame.w, frame.h);
    const e = enter(local, 0.4, 0.9);
    const hook = fit(ctx, ad.text.hook, W - pad.x * 2.6, 3, u * 8.2, u * 4.6, 500, SERIF);
    const blockH = hook.lines.length * hook.size * 1.16;
    ctx.save();
    ctx.globalAlpha *= e.a;
    const cy = H / 2 + e.rise * u * 2;
    ctx.fillStyle = GOLD;
    ctx.fillRect(W / 2 - u * 5, cy - blockH / 2 - u * 4, u * 10, Math.max(1.5, u * 0.22));
    font(ctx, 500, hook.size, SERIF);
    ctx.fillStyle = "#ffffff";
    hook.lines.forEach((t, i) => ctx.fillText(t, W / 2, cy - blockH / 2 + (i + 0.5) * hook.size * 1.16));
    font(ctx, 600, tu * 2.7);
    spaced(ctx, tu * 0.35);
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fillText(shortPlace(ad.listing.location), W / 2, cy + blockH / 2 + u * 4.2);
    spaced(ctx, 0);
    ctx.restore();
    return;
  }
  // The bars carry the words, so the photograph stays clear.
  const top = fit(ctx, ad.listing.price, W - pad.x * 2, 1, tu * 4.2, tu * 3, 500, SERIF);
  font(ctx, 500, top.size, SERIF);
  ctx.fillStyle = GOLD;
  ctx.fillText(top.lines[0] ?? "", W / 2, bar / 2 + (ad.shape === "vertical" ? bar * 0.18 : 0));
  const text = scene.line ?? ad.listing.name;
  const e = enter(local, 0.5, 0.9);
  const cap = fit(ctx, text, W - pad.x * 2, 2, tu * 3.6, tu * 2.6, 500);
  ctx.save();
  ctx.globalAlpha *= e.a;
  font(ctx, 500, cap.size);
  spaced(ctx, u * 0.12);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  const cy = H - bar / 2 - (ad.shape === "vertical" ? bar * 0.18 : 0);
  cap.lines.forEach((t, i) => ctx.fillText(t, W / 2, cy + (i - (cap.lines.length - 1) / 2) * cap.size * 1.3));
  spaced(ctx, 0);
  ctx.restore();
}

// ---------------------------------------------------------------- Fact Sheet

function facts(env: Env, scene: Scene, local: number, progress: number) {
  const { ctx, W, H, u, tu, pad, ad } = env;
  if (scene.kind === "outro") return closing(env, scene, local, progress, { bg: NAVY, overlay: 0.93, accent: SUN, family: SANS, align: "left", ctaBg: SUN, ctaFg: NAVY });
  // Vertical: the photo above the facts. Square and wide: side by side.
  const stacked = ad.shape === "vertical";
  const pic: Rect = stacked ? { x: 0, y: 0, w: W, h: H * 0.4 } : { x: 0, y: 0, w: W * (ad.shape === "wide" ? 0.52 : 0.44), h: H };
  const panel: Rect = stacked ? { x: 0, y: pic.h, w: W, h: H - pic.h } : { x: pic.w, y: 0, w: W - pic.w, h: H };
  const cam = camera(scene, progress, 0.9);
  photo(env, scene.photo, { ...pic, h: pic.h + (stacked ? u * 4 : 0) }, cam.zoom, cam.panX, cam.panY);
  ctx.fillStyle = NAVY;
  if (stacked) {
    rounded(ctx, { x: panel.x, y: panel.y, w: panel.w, h: panel.h + u * 6 }, u * 4);
    ctx.fill();
  } else ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  const x = panel.x + (stacked ? pad.x : u * 5);
  const maxW = panel.w - (stacked ? pad.x * 2 : u * 10);
  const top = panel.y + (stacked ? u * 5 : pad.top);
  const bottom = H - (stacked ? pad.bottom * 0.75 : pad.bottom);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const price = fit(ctx, ad.listing.price, maxW, 1, tu * 7.6, tu * 4.4, 800);
  font(ctx, 800, price.size);
  ctx.fillStyle = SUN;
  ctx.fillText(price.lines[0] ?? "", x, top + price.size * 0.9);
  const title = fit(ctx, scene.kind === "intro" ? ad.text.hook : ad.listing.name, maxW, 2, tu * 3.7, tu * 2.8, 700);
  font(ctx, 700, title.size);
  ctx.fillStyle = "#ffffff";
  let y = top + price.size * 1.2;
  title.lines.forEach((t, i) => ctx.fillText(t, x, y + (i + 0.9) * title.size * 1.2));
  y += title.lines.length * title.size * 1.2 + tu * 1;
  const place = fit(ctx, shortPlace(ad.listing.location), maxW - tu * 4, 1, tu * 2.9, tu * 2.3, 500);
  font(ctx, 500, place.size);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  pin(ctx, x, y + place.size * 0.1, place.size * 0.95, SUN);
  ctx.fillText(place.lines[0] ?? "", x + place.size * 1.3, y + place.size * 0.95);
  y += place.size * 1.5 + tu * 1.8;
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(x, y, maxW, Math.max(1.5, u * 0.18));
  y += tu * 1.6;

  // Every fact has its place from the start, faint, and lights up in its own scene.
  const lines = env.tl.scenes.filter((s) => s.kind === "photo" && s.line).map((s) => s.line!);
  if (!lines.length) return;
  const row = Math.min(tu * 8, (bottom - y) / lines.length);
  const size = Math.min(tu * 3.9, row * 0.44);
  lines.forEach((text, i) => {
    const lit = scene.kind === "intro" ? 0 : i < scene.index ? 1 : i === scene.index ? enter(local, 0.15, 0.4).a : 0;
    const cy = y + row * (i + 0.5);
    // One line where it fits; two smaller lines only if the row is tall enough for them.
    const fitted = fitShort(ctx, text, maxW - size * 2.3, size, size * 0.72, 600, Math.min(size * 0.8, row / 2.6));
    const drawRow = (alpha: number, filled: boolean) => {
      ctx.save();
      ctx.globalAlpha *= alpha;
      if (filled) check(ctx, x + size * 0.7, cy, size * 0.7, "#2f7af5");
      else {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1.5, size * 0.09);
        ctx.beginPath();
        ctx.arc(x + size * 0.7, cy, size * 0.62, 0, Math.PI * 2);
        ctx.stroke();
      }
      font(ctx, 600, fitted.size);
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      fitted.lines.forEach((t, k) => ctx.fillText(t, x + size * 2.1, cy + (k - (fitted.lines.length - 1) / 2) * fitted.size * 1.15 + fitted.size * 0.05));
      ctx.restore();
    };
    if (lit < 1) drawRow(0.26 * (1 - lit), false);
    if (lit > 0) drawRow(lit, true);
  });
}

const DRAW: Record<TemplateId, (env: Env, scene: Scene, local: number, progress: number) => void> = { showcase, bold, elegant, facts };

/** Draw the ad as it looks at time t (seconds). */
export function drawFrame(ctx: Ctx, ad: RenderAd, timeline: Timeline, t: number) {
  const { width: W, height: H } = SHAPES[ad.shape];
  const u = Math.min(W, H) / 100;
  const vertical = ad.shape === "vertical";
  const env: Env = { ctx, W, H, u, tu: u * (vertical ? 1.3 : 1), pad: { x: u * (vertical ? 7 : 6), top: vertical ? H * 0.1 : u * 7, bottom: vertical ? H * 0.17 : u * 8 }, ad, tl: timeline, t };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const time = Math.max(0, Math.min(timeline.duration - 1e-4, t));
  for (const { scene, local, progress } of scenesAt(timeline, time)) {
    // A scene comes in over the fade: most by dissolving, Bold Deal by sliding in from the right.
    const inn = scene.kind === "intro" ? 1 : clamp01(local / timeline.fade);
    ctx.save();
    if (ad.template === "bold" && inn < 1) {
      ctx.translate((1 - easeOut(inn)) * W, 0);
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
    } else ctx.globalAlpha = ad.template === "elegant" ? easeInOut(inn) : inn;
    DRAW[ad.template](env, scene, local, progress);
    ctx.restore();
  }
  ctx.restore();
}

export const timelineFor = (ad: Pick<RenderAd, "template" | "photos" | "text">) => buildTimeline(ad.template, ad.photos.length, ad.text.lines);
