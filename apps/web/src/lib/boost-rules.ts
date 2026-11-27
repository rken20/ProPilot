/**
 * Boosting a Facebook video for Messenger chats: the owner's limits, the suggested plan, the
 * audience, and reading Meta's results. Pure, so the server, the screens and the tests share it.
 *
 * Owner's decisions, 27 Nov 2026: Pro and Agency only; at most ₱1,000 a day and ₱10,000 per
 * boost; suggest ₱300 a day for 5 days within about 20 km; the owner approves every boost.
 * The database enforces the same limits (migration 20261127030000_ad_boosts.sql).
 */
export const BOOST_PLANS: readonly string[] = ["pro", "agency"];
export const boostsIncluded = (planCode: string) => BOOST_PLANS.includes(planCode);

/** All amounts in centavos, like the rest of the app and like Meta's budgets for PHP accounts. */
export const BOOST_LIMITS = {
  minDailyMinor: 10_000, // ₱100
  maxDailyMinor: 100_000, // ₱1,000
  maxTotalMinor: 1_000_000, // ₱10,000
  minDays: 1,
  maxDays: 14,
  radiusKm: 20,
} as const;

/**
 * The plan the app suggests. Published Philippine figures put a usable test at about ₱300 to ₱500 a
 * day (video ads plan, Sources); listings above ₱10 million have fewer buyers, so they start higher.
 */
export function suggestedPlan(priceMinor: number | null | undefined): { dailyMinor: number; days: number } {
  return { dailyMinor: (priceMinor ?? 0) > 1_000_000_000 ? 50_000 : 30_000, days: 5 };
}

export type PlanCheck = { ok: true; dailyMinor: number; days: number; totalMinor: number } | { ok: false; error: string };

/** Check a plan the owner typed: whole pesos a day and whole days, inside the limits. */
export function checkPlan(dailyPesos: unknown, days: unknown): PlanCheck {
  const d = Number(String(dailyPesos ?? "").replace(/[₱,\s]/g, ""));
  const n = Number(days);
  if (!Number.isInteger(d) || !Number.isInteger(n)) return { ok: false, error: "Enter whole pesos a day and a whole number of days." };
  const dailyMinor = d * 100;
  if (dailyMinor < BOOST_LIMITS.minDailyMinor || dailyMinor > BOOST_LIMITS.maxDailyMinor) return { ok: false, error: "The daily amount must be between ₱100 and ₱1,000." };
  if (n < BOOST_LIMITS.minDays || n > BOOST_LIMITS.maxDays) return { ok: false, error: "A boost runs for 1 to 14 days." };
  const totalMinor = dailyMinor * n;
  if (totalMinor > BOOST_LIMITS.maxTotalMinor) return { ok: false, error: "One boost can spend at most ₱10,000 in all. Lower the daily amount or the days." };
  return { ok: true, dailyMinor, days: n, totalMinor };
}

/** A listing's exact pin, when the seller gave one ("10.7202,122.5621"). */
export function pinOf(mapQuery: string | null | undefined): { lat: number; lng: number } | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(mapQuery ?? "");
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/**
 * What to look up on Meta for a listing without a pin, most specific town first:
 * "Barangay Lanag, Pototan, Iloilo" → Pototan, then Iloilo. A single part is looked up as it is.
 */
export function placeQueries(location: string | null | undefined): string[] {
  const parts = (location ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return (parts.length > 1 ? parts.slice(1) : parts).slice(0, 3);
}

export type BoostPlace = { kind: "pin"; lat: number; lng: number; label: string } | { kind: "city"; key: string; label: string };

/**
 * Who sees the boost. Fair housing limits kept for every audience, as the plan says: adults of all
 * ages from 18 and all genders, no interests or other narrowing, at least 20 km around the place.
 * Shown on Facebook only, since the ad opens a Messenger chat with the Page.
 */
export function boostTargeting(place: BoostPlace, radiusKm: number = BOOST_LIMITS.radiusKm): Record<string, unknown> {
  const geo =
    place.kind === "pin"
      ? { custom_locations: [{ latitude: place.lat, longitude: place.lng, radius: radiusKm, distance_unit: "kilometer" }] }
      : { cities: [{ key: place.key, radius: radiusKm, distance_unit: "kilometer" }] };
  return { geo_locations: geo, age_min: 18, age_max: 65, publisher_platforms: ["facebook"] };
}

/** Meta's name for a chat started from an ad. */
export const CHAT_ACTION = "onsite_conversion.messaging_conversation_started_7d";

export type BoostResults = { spendMinor: number; impressions: number; reach: number; chats: number };

/** Read one row of Meta's campaign insights. Spend comes in pesos as text, e.g. "123.45". */
export function readBoostInsights(row: unknown): BoostResults {
  const r = (row ?? {}) as { spend?: unknown; impressions?: unknown; reach?: unknown; actions?: unknown };
  const num = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? x : 0;
  };
  const actions = Array.isArray(r.actions) ? (r.actions as Array<{ action_type?: unknown; value?: unknown }>) : [];
  const chats = actions.find((a) => a.action_type === CHAT_ACTION);
  return { spendMinor: Math.round(num(r.spend) * 100), impressions: Math.round(num(r.impressions)), reach: Math.round(num(r.reach)), chats: Math.round(num(chats?.value)) };
}

/** Pesos per chat, or null before there is a chat. */
export const costPerChat = (r: Pick<BoostResults, "spendMinor" | "chats">) => (r.chats > 0 ? Math.round(r.spendMinor / r.chats) : null);

export type BoostStatus = "creating" | "active" | "stopped" | "finished" | "failed";

/** An active boost whose end date has passed is finished. */
export function settledStatus(status: BoostStatus, endsAt: string | null, now = new Date()): BoostStatus {
  return status === "active" && endsAt && new Date(endsAt) <= now ? "finished" : status;
}
