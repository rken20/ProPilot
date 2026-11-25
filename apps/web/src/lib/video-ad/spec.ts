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

/**
 * A template's tempo and how long its parts last, in beats, so every cut lands
 * on the beat of the music. `hook` is the opening, `clip` a photo with a
 * caption, `quick` a photo without one, `close` the closing card. `cut` is the
 * length of the move between two scenes, in seconds.
 *
 * The shape follows what works for listing reels: a hook in the first two or
 * three seconds, clips of one to three seconds, and the price and call to
 * action held long enough to read.
 */
type Timing = { bpm: number; hook: number; clip: number; quick: number; close: number; cut: number };

export const TEMPLATES = {
  showcase: {
    label: "Showcase",
    about: "A quick tour: one room and one bold caption per cut, then the price and how to reach you.",
    bestFor: "Most houses and condos with several photos",
    timing: { bpm: 112, hook: 4, clip: 4, quick: 2, close: 8, cut: 0.22 } satisfies Timing,
  },
  bold: {
    label: "Bold Deal",
    about: "Fast cuts, big block type and the price on screen the whole time. Made to stop the scroll.",
    bestFor: "Affordable listings, lots, and anything priced to sell",
    timing: { bpm: 128, hook: 4, clip: 4, quick: 2, close: 10, cut: 0.18 } satisfies Timing,
  },
  elegant: {
    label: "Elegant",
    about: "Slower moves, soft cuts and quiet serif captions.",
    bestFor: "Premium homes",
    timing: { bpm: 84, hook: 4, clip: 3, quick: 2, close: 6, cut: 0.45 } satisfies Timing,
  },
  facts: {
    label: "Fact Sheet",
    about: "The photo on one side and the key facts ticking in one by one.",
    bestFor: "Listings with few photos, or buyers who compare details",
    timing: { bpm: 104, hook: 4, clip: 4, quick: 2, close: 8, cut: 0.2 } satisfies Timing,
  },
  reveal: {
    label: "Price Reveal",
    about: "Shows the home first and holds the price back until the last card, so people watch to the end.",
    bestFor: "Listings whose price is a pleasant surprise for what they offer",
    timing: { bpm: 120, hook: 4, clip: 4, quick: 2, close: 10, cut: 0.2 } satisfies Timing,
  },
  reasons: {
    label: "Top 3 Reasons",
    about: "Counts through the three strongest reasons to see the property, one per photo.",
    bestFor: "Listings with a few clear selling points",
    timing: { bpm: 96, hook: 4, clip: 4, quick: 4, close: 8, cut: 0.2 } satisfies Timing,
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
  /** Seconds from the start. Scenes follow one another with no gap and no overlap. */
  start: number;
  end: number;
  /** Which photo it shows (an index into the ad's photos). */
  photo: number;
  /** The feature line shown with it, if there is one. */
  line: string | null;
  /** Its number among the photo scenes (0 for the intro and outro). */
  index: number;
};

/** `beat` is the length of one beat in seconds; `cut` how long the move from one scene into the next takes, at the start of each scene. */
export type Timeline = { scenes: Scene[]; duration: number; bpm: number; beat: number; cut: number; frames: number };

/** Which photo opens the ad, and which photo each feature line is shown over (indexes into the listing's photos). */
export type PhotoPlan = { opener: number; forLines: number[] };
export const NO_PHOTO_PLAN: PhotoPlan = { opener: 0, forLines: [] };

/**
 * The photo for each photo scene: the one picked for that scene's line if there
 * is a pick, otherwise the next photo not shown yet (the opener last, since the
 * ad starts and ends on it).
 */
export function photoSequence(photoCount: number, sceneCount: number, plan: PhotoPlan = NO_PHOTO_PLAN): { opener: number; scenes: number[] } {
  const n = Math.max(1, Math.floor(photoCount));
  const valid = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < n;
  const opener = valid(plan.opener) ? plan.opener : 0;
  const picked = Array.from({ length: sceneCount }, (_, i) => (valid(plan.forLines[i]) ? plan.forLines[i]! : null));
  // Photos nobody picked, in their own order. When they run out the ad goes round
  // again from the photo after the one just shown, so a photo never follows itself.
  const taken = new Set<number>([opener, ...picked.filter((p): p is number => p !== null)]);
  const spare = Array.from({ length: n }, (_, i) => i).filter((i) => !taken.has(i));
  let last = opener;
  return { opener, scenes: picked.map((p) => (last = p ?? spare.shift() ?? (last + 1) % n)) };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Lay the ad out in time, on the beat: the hook on the opening photo, one clip
 * per photo (or per caption, whichever is more), then the closing card. A clip
 * with a caption stays long enough to read it; one without is a quick cut.
 * With one or two photos they repeat, moving differently each time.
 */
export function buildTimeline(template: TemplateId, photoCount: number, lines: string[], picks: PhotoPlan = NO_PHOTO_PLAN): Timeline {
  const t = TEMPLATES[template].timing;
  const beat = 60 / t.bpm;
  const photos = clamp(Math.floor(photoCount), 1, MAX_PHOTOS);
  // Top 3 Reasons shows exactly its reasons, three at most.
  const shown = lines.slice(0, template === "reasons" ? 3 : MAX_LINES);
  const count = template === "reasons" ? clamp(shown.length, 1, 3) : clamp(Math.max(photos - 1, shown.length), 2, 7);
  const order = photoSequence(photos, count, picks);
  const scenes: Scene[] = [];
  let at = 0;
  const add = (kind: Scene["kind"], beats: number, photo: number, line: string | null, index: number) => {
    scenes.push({ kind, start: at, end: at + beats * beat, photo, line, index });
    at += beats * beat;
  };
  add("intro", t.hook, order.opener, null, 0);
  for (let i = 0; i < count; i++) add("photo", shown[i] ? t.clip : t.quick, order.scenes[i]!, shown[i] ?? null, i);
  add("outro", t.close, order.opener, null, 0);
  return { scenes, duration: at, bpm: t.bpm, beat, cut: t.cut, frames: Math.round(at * FPS) };
}

/** When the price lands on the closing card, in seconds into it (later in Price Reveal, which holds it back). The drawing and the sound both follow these. */
export const PRICE_AT = { normal: 0.3, reveal: 1.0 } as const;
/** When a caption's first word comes in, in seconds into its clip. */
export const CAPTION_AT = 0.14;

/** The scene on screen at time t, with how far into it we are. */
export function sceneAt(timeline: Timeline, t: number): { index: number; scene: Scene; local: number } {
  const last = timeline.scenes.length - 1;
  let index = timeline.scenes.findIndex((s) => t < s.end);
  if (index < 0) index = last;
  const scene = timeline.scenes[index]!;
  return { index, scene, local: Math.max(0, t - scene.start) };
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

export const DEFAULT_CTA = { english: "Message us to book a viewing", taglish: "I-message kami para mag-viewing" } as const;
export type AdLanguage = keyof typeof DEFAULT_CTA;

/**
 * The price the way people say it, when that is exactly the price: "₱8.5M" for
 * ₱8,500,000. A price that doesn't come out even is left as the listing has it,
 * so the ad never rounds a price.
 */
export function shortPrice(l: Pick<AdListing, "price" | "priceMinor">): string {
  const pesos = l.priceMinor / 100;
  if (!l.price.startsWith("₱") || pesos < 1_000_000 || pesos % 10_000 !== 0) return l.price;
  return `₱${(pesos / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
}

/** What it takes to get in, for the closing card: the listing's own financing, reservation fee and downpayment, one short tag each. */
export function termsOf(l: AdListing): string[] {
  return [...l.financing, l.reservationFee ? `Reservation ${l.reservationFee}` : "", l.downpaymentPercent !== null ? `${l.downpaymentPercent}% downpayment` : ""].filter(Boolean);
}

const HOOK_WORDS = {
  english: { looking: (article: string, type: string, place: string) => `Looking for ${article} ${type} in ${place}?`, inside: (type: string, place: string) => `Take a look inside this ${type} in ${place}` },
  taglish: { looking: (_article: string, type: string, place: string) => `Naghahanap ng ${type} sa ${place}?`, inside: (type: string, place: string) => `Silipin ang ${type} na ito sa ${place}` },
} as const;

/**
 * The ad's words when the AI isn't used: every one of them comes straight from
 * the listing. Captions are short phrases from the owner's description; the
 * financing and fees go on the closing card, not over the photos.
 */
export function defaultText(l: AdListing, language: AdLanguage = "english"): AdText {
  return { hook: defaultHooks(l, language)[0]!, lines: phrasesFrom(l.description).slice(0, MAX_LINES), cta: DEFAULT_CTA[language] };
}

/**
 * Opening lines to choose from when the AI isn't used, in the shapes that stop
 * a scroll: the price and place, a question to the buyer, and an invitation in.
 * Each one is only the listing's own facts.
 */
export function defaultHooks(l: AdListing, language: AdLanguage = "english"): string[] {
  const place = shortPlace(l.location);
  const type = l.typeLabel.toLowerCase();
  const article = /^[aeiou]/.test(type) ? "an" : "a";
  const words = HOOK_WORDS[language];
  const options = [`${shortPrice(l)} ${type} in ${place}`, words.looking(article, type, place), words.inside(type, place)];
  return options.map((h) => tidy(h, LIMITS.hook)).filter((h, i, all) => h.length >= 3 && all.indexOf(h) === i);
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

export type CleanPlan = { template: TemplateId; reason: string; text: AdText; hooks: string[]; photos: PhotoPlan };

/**
 * Check what the AI (or anyone) proposed and fall back, part by part, to the
 * listing's own facts: an unknown template, an empty or over-long text, a line
 * with an amount the listing doesn't state, or a photo that doesn't exist.
 * Photo numbers in the proposal count from 1, as the AI is shown them.
 */
export function cleanPlan(raw: unknown, l: AdListing, photoCount: number, language: AdLanguage = "english"): CleanPlan {
  const r = (raw ?? {}) as Record<string, unknown>;
  const fallback = defaultText(l, language);
  const ok = (s: string) => s.length >= 3 && !statesOtherAmount(s, l);
  const photo = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= photoCount ? (v as number) - 1 : null);
  const template = TEMPLATE_IDS.includes(r.template as TemplateId) ? (r.template as TemplateId) : pickTemplate(l, photoCount);
  const cta = tidy(r.cta, LIMITS.cta);

  // A line and the photo it was written for stay together.
  const forPhoto = Array.isArray(r.line_photos) ? r.line_photos : [];
  const seen = new Set<string>();
  const pairs = (Array.isArray(r.lines) ? r.lines : [])
    .map((x, i) => ({ line: tidy(x, LIMITS.line), photo: photo(forPhoto[i]) }))
    .filter((p) => ok(p.line) && !seen.has(p.line.toLowerCase()) && (seen.add(p.line.toLowerCase()), true))
    .slice(0, MAX_LINES);

  const proposed = [r.hook, ...(Array.isArray(r.hooks) ? r.hooks : [])].map((h) => tidy(h, LIMITS.hook)).filter(ok);
  // Up to three openings to choose from: the AI's first, then ones built from the listing's facts.
  const all = [proposed[0] ?? fallback.hook, ...proposed.slice(1), ...defaultHooks(l, language)].filter((h, i, list) => list.findIndex((x) => x.toLowerCase() === h.toLowerCase()) === i);
  // Price Reveal keeps the price for the last card, so it opens with a headline that doesn't state it.
  const hooks = (template === "reveal" ? [...all.filter((h) => !amountsIn(h).length), ...all.filter((h) => amountsIn(h).length)] : all).slice(0, 3);
  const usePairs = pairs.length > 0;
  return {
    template,
    reason: tidy(r.reason, 160),
    text: { hook: hooks[0]!, lines: usePairs ? pairs.map((p) => p.line) : fallback.lines, cta: ok(cta) ? cta : fallback.cta },
    hooks,
    photos: { opener: photo(r.opening_photo) ?? 0, forLines: usePairs ? pairs.map((p) => p.photo ?? -1) : [] },
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
