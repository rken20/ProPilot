/**
 * The Video Ad Maker's plain logic: shapes, templates, the scene timeline and
 * the ad's text. No canvas and no server code here, so it can be unit-tested.
 *
 * A video ad is built from the listing's own photos and the owner's own facts.
 * Nothing is generated or changed in the photos, and the text never states a
 * price or amount the listing doesn't have.
 */

export const FPS = 30;
export const MAX_PHOTOS = 8;
export const MAX_LINES = 6;
export const LIMITS = { hook: 60, line: 44, cta: 44 } as const;

export const SHAPES = {
  vertical: { label: "Vertical", use: "Reels, TikTok, Stories", width: 720, height: 1280 },
  square: { label: "Square", use: "Facebook feed, Marketplace", width: 1080, height: 1080 },
  wide: { label: "Wide", use: "YouTube, websites", width: 1280, height: 720 },
} as const;
export type ShapeId = keyof typeof SHAPES;
export const SHAPE_IDS = Object.keys(SHAPES) as ShapeId[];

/** Seconds for each part of a template, and the overlap between scenes. */
type Timing = { intro: number; photo: number; outro: number; fade: number };

export const TEMPLATES = {
  showcase: {
    label: "Showcase",
    about: "A calm photo tour with one feature per photo, then the price and how to reach you.",
    bestFor: "Most houses and condos with several photos",
    timing: { intro: 2.6, photo: 2.6, outro: 3.6, fade: 0.5 } satisfies Timing,
  },
  bold: {
    label: "Bold Deal",
    about: "Fast cuts, big type and the price up front. Made to stop the scroll.",
    bestFor: "Affordable listings, lots, and anything priced to sell",
    timing: { intro: 2.0, photo: 1.7, outro: 3.2, fade: 0.3 } satisfies Timing,
  },
  elegant: {
    label: "Elegant",
    about: "Slow moves, wide margins and quiet serif type.",
    bestFor: "Premium homes",
    timing: { intro: 3.0, photo: 3.2, outro: 4.0, fade: 0.8 } satisfies Timing,
  },
  facts: {
    label: "Fact Sheet",
    about: "The photo on one side and the key facts ticking in one by one.",
    bestFor: "Listings with few photos, or buyers who compare details",
    timing: { intro: 2.2, photo: 1.9, outro: 3.4, fade: 0.4 } satisfies Timing,
  },
} as const;
export type TemplateId = keyof typeof TEMPLATES;
export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];

/** What the ad says. Every word is the owner's to edit. */
export type AdText = { hook: string; lines: string[]; cta: string };

/** The listing facts an ad can show. Money values are already formatted, e.g. "₱2,500,000". */
export type AdListing = {
  name: string;
  typeLabel: string;
  location: string;
  price: string;
  priceMinor: number;
  status: "available" | "reserved";
  reservationFee: string | null;
  downpaymentPercent: number | null;
  financing: string[];
  description: string;
  business: string;
};

export type Scene = {
  kind: "intro" | "photo" | "outro";
  /** Seconds from the start. A scene's last `fade` seconds overlap the next scene's first. */
  start: number;
  end: number;
  /** Which photo it shows (an index into the ad's photos). */
  photo: number;
  /** The feature line shown with it, if there is one. */
  line: string | null;
  /** Its number among the photo scenes (0 for the intro and outro). */
  index: number;
};

export type Timeline = { scenes: Scene[]; duration: number; fade: number; frames: number };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Lay the ad out in time: an intro on the cover photo, one scene per photo (or
 * per feature line, whichever is more), then the closing card. With one or two
 * photos they repeat, moving differently each time.
 */
export function buildTimeline(template: TemplateId, photoCount: number, lines: string[]): Timeline {
  const t = TEMPLATES[template].timing;
  const photos = clamp(Math.floor(photoCount), 1, MAX_PHOTOS);
  const shown = lines.slice(0, MAX_LINES);
  const count = clamp(Math.max(photos - 1, shown.length), 2, 7);
  const scenes: Scene[] = [];
  let at = 0;
  const add = (kind: Scene["kind"], length: number, photo: number, line: string | null, index: number) => {
    scenes.push({ kind, start: at, end: at + length, photo, line, index });
    at += length - t.fade;
  };
  add("intro", t.intro, 0, null, 0);
  // The photo scenes start on the second photo, so the cover isn't shown twice in a row.
  for (let i = 0; i < count; i++) add("photo", t.photo, (i + 1) % photos, shown[i] ?? null, i);
  add("outro", t.outro, 0, null, 0);
  const duration = scenes[scenes.length - 1]!.end;
  return { scenes, duration, fade: t.fade, frames: Math.round(duration * FPS) };
}

/** The scenes on screen at time t: the current one, and the next while they overlap. */
export function scenesAt(timeline: Timeline, t: number): Array<{ scene: Scene; local: number; progress: number }> {
  return timeline.scenes
    .filter((s) => t >= s.start && t < s.end)
    .map((scene) => ({ scene, local: t - scene.start, progress: (t - scene.start) / (scene.end - scene.start) }));
}

// ------------------------------------------------------------------ the words

const tidy = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max).trim() : "");

/** "Barangay Lanag, Pototan, Iloilo" → "Pototan, Iloilo": short enough for a headline. */
export function shortPlace(location: string): string {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  return (parts.length > 2 ? parts.slice(-2) : parts).join(", ");
}

/** Short phrases from the owner's description, in their own words. Long sentences are skipped, not cut, so no claim is changed. */
export function phrasesFrom(description: string, max = LIMITS.line): string[] {
  const seen = new Set<string>();
  return description
    .split(/[\n\r.;•|]+|\s[-–—]\s|,\s(?=[A-Z0-9])/)
    .map((p) => p.replace(/^[\s\-–—*✓✔·]+/, "").replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 4 && p.length <= max && /[a-z]/i.test(p))
    .filter((p) => (seen.has(p.toLowerCase()) ? false : (seen.add(p.toLowerCase()), true)));
}

export const DEFAULT_CTA = { english: "Message us to schedule a viewing", taglish: "Message us para mag-schedule ng viewing" } as const;
export type AdLanguage = keyof typeof DEFAULT_CTA;

/** The ad's words when the AI isn't used: every one of them comes straight from the listing. */
export function defaultText(l: AdListing, language: AdLanguage = "english"): AdText {
  const sale = l.status === "reserved" ? "" : " for sale";
  const hook = tidy(`${l.typeLabel}${sale} in ${shortPlace(l.location)}`, LIMITS.hook);
  const facts = [
    l.financing.length ? `${l.financing.join(", ")} accepted` : null,
    l.reservationFee ? `Reservation fee ${l.reservationFee}` : null,
    l.downpaymentPercent !== null ? `${l.downpaymentPercent}% downpayment` : null,
  ].filter((x): x is string => Boolean(x && x.length <= LIMITS.line));
  const lines = [...phrasesFrom(l.description).slice(0, MAX_LINES - facts.length), ...facts].slice(0, MAX_LINES);
  return { hook, lines, cta: DEFAULT_CTA[language] };
}

/** The template picked by simple rules, used when the AI isn't available. */
export function pickTemplate(l: Pick<AdListing, "priceMinor" | "typeLabel">, photoCount: number): TemplateId {
  if (photoCount <= 2) return "facts";
  if (l.priceMinor >= 1_500_000_000) return "elegant";
  if (l.priceMinor <= 300_000_000 || /^lot\b/i.test(l.typeLabel)) return "bold";
  return "showcase";
}

/** Peso amounts written in a text, in pesos: "₱2.5M", "P 20,000", "PHP 4,500,000", "2.5 million". */
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  const re = /(?:₱|\bphp\b|\bp(?=\s?\d))\s?(\d[\d,]*(?:\.\d+)?)\s?(m\b|million\b|k\b|thousand\b)?|(\d[\d,]*(?:\.\d+)?)\s?(m\b|million\b|k\b|thousand\b)/gi;
  for (const m of text.matchAll(re)) {
    const n = Number((m[1] ?? m[3] ?? "").replace(/,/g, ""));
    const unit = (m[2] ?? m[4] ?? "").toLowerCase();
    if (!Number.isFinite(n)) continue;
    out.push(Math.round(n * (unit.startsWith("m") ? 1_000_000 : unit === "k" || unit.startsWith("t") ? 1_000 : 1)));
  }
  return out;
}

/** True when a text states a peso amount the listing doesn't have. Such text is never shown. */
export function statesOtherAmount(text: string, l: Pick<AdListing, "price" | "reservationFee">): boolean {
  const allowed = new Set([...amountsIn(l.price), ...(l.reservationFee ? amountsIn(l.reservationFee) : [])]);
  return amountsIn(text).some((a) => !allowed.has(a));
}

/**
 * Check what the AI (or anyone) proposed and fall back, part by part, to the
 * listing's own facts: an unknown template, an empty or over-long text, or a
 * line with an amount the listing doesn't state.
 */
export function cleanPlan(raw: unknown, l: AdListing, photoCount: number, language: AdLanguage = "english"): { template: TemplateId; reason: string; text: AdText } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const fallback = defaultText(l, language);
  const ok = (s: string) => s.length >= 3 && !statesOtherAmount(s, l);
  const template = TEMPLATE_IDS.includes(r.template as TemplateId) ? (r.template as TemplateId) : pickTemplate(l, photoCount);
  const hook = tidy(r.hook, LIMITS.hook);
  const cta = tidy(r.cta, LIMITS.cta);
  const lines = (Array.isArray(r.lines) ? r.lines : [])
    .map((x) => tidy(x, LIMITS.line))
    .filter(ok)
    .filter((x, i, all) => all.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i)
    .slice(0, MAX_LINES);
  return {
    template,
    reason: tidy(r.reason, 160),
    text: { hook: ok(hook) ? hook : fallback.hook, lines: lines.length ? lines : fallback.lines, cta: ok(cta) ? cta : fallback.cta },
  };
}

/** The owner's edits, tidied the same way before a video is made. */
export function cleanText(text: AdText): AdText {
  return {
    hook: tidy(text.hook, LIMITS.hook),
    lines: text.lines.map((x) => tidy(x, LIMITS.line)).filter(Boolean).slice(0, MAX_LINES),
    cta: tidy(text.cta, LIMITS.cta),
  };
}
