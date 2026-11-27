/**
 * The app's own checks on a listing. Each one only files a report for the app
 * admin to read: nothing here hides a listing or tells the seller. They are
 * rough on purpose, so the admin sees a doubtful listing early; the admin
 * decides.
 */

export type AutoReason = "auto_price" | "auto_wording" | "auto_photos";
export type Finding = { reason: AutoReason; details: string };

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------
const PAY =
  "(?:pay(?:ment)?|bayad|magbayad|deposit|padala|send|gcash|maya|reservation(?: fee)?|down ?payment|dp)";
const SEE = "(?:view(?:ing)?|tripping|site ?visit|makita|bisita|ocular)";
const WORDING: RegExp[] = [
  // "bayad muna bago viewing", "reservation fee before viewing"
  new RegExp(
    `\\b${PAY}\\b[^.!?\\n]{0,40}\\b(?:before|bago|prior to)\\b[^.!?\\n]{0,25}\\b${SEE}\\b`,
  ),
  // "before viewing, send the reservation fee"
  new RegExp(
    `\\b(?:before|bago|prior to)\\b[^.!?\\n]{0,25}\\b${SEE}\\b[^.!?\\n]{0,40}\\b${PAY}\\b`,
  ),
  // "no viewing until payment", "walang viewing"
  new RegExp(
    `\\b(?:no|walang|wala munang|bawal)\\b[^.!?\\n]{0,12}\\b${SEE}\\b`,
  ),
  // Ways to pay that can't be traced or reversed
  /\b(?:western union|moneygram|money gram|bitcoin|crypto|usdt|gift ?cards?)\b/,
  // A wallet number in the listing itself: "GCash 0917 123 4567"
  /\b(?:gcash|g-cash|maya|paymaya)\b[^.!?\n]{0,30}(?:\+?63[\s-]?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/,
];

/**
 * Wording that asks for money before a viewing, or through a channel that
 * can't be traced. Returns the words that matched, for the admin to read.
 */
export function payFirstWording(text: string): string | null {
  const t = fold(text).replace(/[ \t]+/g, " ");
  for (const re of WORDING) {
    const m = re.exec(t);
    if (m) return m[0].trim().slice(0, 160);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Price
// ---------------------------------------------------------------------------
/** Words in a location that don't say where it is. */
const PLACE_NOISE = new Set([
  "city",
  "brgy",
  "barangay",
  "street",
  "road",
  "avenue",
  "province",
  "philippines",
  "subdivision",
  "village",
  "phase",
  "block",
  "near",
  "along",
  "north",
  "south",
  "east",
  "west",
  "metro",
  "poblacion",
  "purok",
  "sitio",
  "zone",
  "district",
  "town",
  "municipality",
  "homes",
  "residences",
  "tower",
  "towers",
]);

/** The words of a location that name a place. */
export function placeWords(location: string): string[] {
  return [
    ...new Set(
      fold(location)
        .split(/[^a-z]+/)
        .filter((w) => w.length >= 4 && !PLACE_NOISE.has(w)),
    ),
  ];
}

/** Two listings are in the same area when their locations share a place name. */
export function sameArea(a: string, b: string): boolean {
  const words = new Set(placeWords(a));
  return placeWords(b).some((w) => words.has(w));
}

/** Under this, any property for sale gets a second look (₱50,000). */
export const PRICE_FLOOR_MINOR = 5_000_000;
/** A price under this share of the usual price of similar listings gets a second look. */
export const PRICE_SHARE = 0.35;
/** How many similar listings it takes before "usual" means anything. */
export const MIN_PEERS = 3;

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/**
 * A price far below similar listings: the same type in the same area. `peers`
 * are their prices, without this listing. Null when the price is unremarkable
 * or there are too few listings to compare with.
 */
export function priceFarBelow(
  priceMinor: number,
  peers: number[],
): { usual: number | null; percent: number | null; count: number } | null {
  const real = peers.filter((p) => p > 0);
  if (real.length >= MIN_PEERS) {
    const usual = median(real);
    if (priceMinor < usual * PRICE_SHARE)
      return {
        usual,
        percent: Math.round((priceMinor / usual) * 100),
        count: real.length,
      };
  }
  if (priceMinor < PRICE_FLOOR_MINOR)
    return { usual: null, percent: null, count: real.length };
  return null;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------
/**
 * A photo's fingerprint from its 9 by 8 grayscale pixels (row by row, 72
 * values): each bit says whether a pixel is brighter than the one to its right.
 * A resized or re-saved copy of the same picture gives the same bits, or nearly.
 */
export function fingerprint(gray: ArrayLike<number>): string | null {
  if (gray.length !== 72) return null;
  let hex = "";
  let ones = 0;
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) {
      const bit = gray[row * 9 + col]! > gray[row * 9 + col + 1]! ? 1 : 0;
      ones += bit;
      byte = (byte << 1) | bit;
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  // A blank wall, a plain sky, a white floor plan: too little in the picture to tell copies from look-alikes.
  return ones < 10 || ones > 54 ? null : hex;
}

/** How many of the 64 bits differ between two fingerprints. */
export function bitsApart(a: string, b: string): number {
  let n = 0;
  for (let i = 0; i < 16; i += 4) {
    let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16);
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}

/** Two fingerprints this close are the same picture. */
export const SAME_PHOTO_BITS = 4;

/**
 * Other sellers' listings that share this listing's photos. `mine` are this
 * listing's fingerprints; `others` are photos of other businesses. A listing
 * counts when at least `need` of this listing's photos are on it (one shared
 * stock photo of a clubhouse isn't a copied listing).
 */
export function sharedPhotos(
  mine: string[],
  others: Array<{ hash: string; property_id: string }>,
  need = 2,
): Array<{ property_id: string; shared: number }> {
  const hits = new Map<string, Set<string>>();
  for (const o of others) {
    for (const m of mine) {
      if (bitsApart(m, o.hash) <= SAME_PHOTO_BITS) {
        if (!hits.has(o.property_id)) hits.set(o.property_id, new Set());
        hits.get(o.property_id)!.add(m);
        break;
      }
    }
  }
  return [...hits.entries()]
    .map(([property_id, set]) => ({ property_id, shared: set.size }))
    .filter((h) => h.shared >= need)
    .sort((a, b) => b.shared - a.shared);
}
