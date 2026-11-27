/**
 * The Google map on a listing. It shows the location typed on the listing, or
 * the exact pin when the seller gave one: coordinates, or a place name read
 * from a Google Maps link. Nothing here asks Google anything; these are the
 * addresses the page embeds and links to, and the rules for what a seller may
 * paste.
 */

/** What the map searches for: the seller's pin when there is one, else the listing's location. */
export function mapQuery(listing: {
  location: string;
  map_query?: string | null;
}): string {
  return (listing.map_query ?? "").trim() || listing.location.trim();
}

/** Opens Google Maps at the place, in a new tab or the phone's Maps app. */
export function mapLink(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * The address of the embedded map. With a Maps Embed API key it is Google's
 * documented embed; without one it is the older keyless embed, which Google
 * still serves but doesn't document.
 */
export function mapEmbedUrl(query: string, key?: string | null): string {
  const q = encodeURIComponent(query);
  const k = (key ?? "").trim();
  return /^[A-Za-z0-9_-]{20,80}$/.test(k)
    ? `https://www.google.com/maps/embed/v1/place?key=${k}&q=${q}&zoom=15`
    : `https://www.google.com/maps?q=${q}&z=15&output=embed`;
}

const num = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const PAIR = new RegExp(`^\\s*${num}\\s*,\\s*${num}\\s*$`);

/** "10.7202, 122.5621" as a pin, to six decimals (about 10 cm). Null when it isn't a place on Earth. */
export function coordinates(
  lat: string | number,
  lng: string | number,
): string | null {
  const a = Number(lat);
  const b = Number(lng);
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    Math.abs(a) > 90 ||
    Math.abs(b) > 180
  )
    return null;
  return `${a.toFixed(6)},${b.toFixed(6)}`;
}

/** Google's own hosts for a full Maps link, and the short links its Share button gives. */
const FULL_HOST = /^(?:www\.|maps\.)?google\.(?:com|com\.ph)$/;
const SHORT_HOST = /^(?:maps\.app\.goo\.gl|goo\.gl)$/;

export const isShortMapLink = (url: URL) =>
  url.protocol === "https:" &&
  SHORT_HOST.test(url.hostname) &&
  (url.hostname !== "goo.gl" || url.pathname.startsWith("/maps/"));
export const isFullMapLink = (url: URL) =>
  url.protocol === "https:" &&
  FULL_HOST.test(url.hostname) &&
  (url.hostname.startsWith("maps.") || url.pathname.startsWith("/maps"));

const clean = (s: string) =>
  s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

/**
 * The pin in a full Google Maps link: the marker's coordinates when the link
 * has them, else the place's name, else where the map was centered.
 */
export function pinFromMapLink(url: URL): string | null {
  if (!isFullMapLink(url)) return null;
  const href = url.href;
  const marker = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(href);
  if (marker) return coordinates(marker[1]!, marker[2]!);
  for (const key of ["q", "query", "ll", "destination"]) {
    const v = url.searchParams.get(key);
    const pair = v ? PAIR.exec(v) : null;
    if (pair) return coordinates(pair[1]!, pair[2]!);
  }
  const place = /\/maps\/place\/([^/@]+)/.exec(url.pathname);
  if (place) {
    let name = place[1]!.replace(/\+/g, " ");
    try {
      name = decodeURIComponent(name);
    } catch {
      // Left as it is.
    }
    const pair = PAIR.exec(name);
    if (pair) return coordinates(pair[1]!, pair[2]!);
    if (clean(name).length >= 2) return clean(name);
  }
  const q = url.searchParams.get("q") ?? url.searchParams.get("query");
  if (q && clean(q).length >= 2) return clean(q);
  const center = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(href);
  return center ? coordinates(center[1]!, center[2]!) : null;
}

export type PinInput =
  | { kind: "none" }
  | { kind: "pin"; query: string }
  /** A short share link: the server has to follow it to see where it goes. */
  | { kind: "short"; url: URL }
  | { kind: "bad" };

/** What a seller typed or pasted into "Exact map pin": coordinates, a Google Maps link, or a place name. */
export function readPinInput(text: string): PinInput {
  const t = text.trim();
  if (!t) return { kind: "none" };
  const pair = PAIR.exec(t);
  if (pair) {
    const pin = coordinates(pair[1]!, pair[2]!);
    return pin ? { kind: "pin", query: pin } : { kind: "bad" };
  }
  if (t.length > 2000) return { kind: "bad" };
  // People paste the link with words around it ("Dropped pin https://maps.app.goo.gl/...").
  const found = /https:\/\/[^\s]+/.exec(t);
  if (!found) {
    // No link: a landmark or place name ("SM City Iloilo"), which is also how a pin read from a link is kept.
    // Anything that looks like another kind of address, or like coordinates that aren't, is refused.
    const name = clean(t);
    const odd =
      /^[a-z][a-z0-9+.-]*:|:\/\/|^www\./i.test(name) ||
      /^[-\d\s.,]+$/.test(name) ||
      t.length > 200;
    return !odd && name.length >= 2
      ? { kind: "pin", query: name }
      : { kind: "bad" };
  }
  let url: URL;
  try {
    url = new URL(found[0]);
  } catch {
    return { kind: "bad" };
  }
  if (isShortMapLink(url)) return { kind: "short", url };
  const pin = pinFromMapLink(url);
  return pin ? { kind: "pin", query: pin } : { kind: "bad" };
}
