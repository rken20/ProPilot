/**
 * Match alerts: what a buyer says they're looking for on the public inquiry
 * form, and which listings to email them. Pure, so the form, the daily job and
 * the tests share one set of rules.
 */
import { scoreMatch, type MatchListing } from "./matching";
import { formatPeso, pesosToCentavos } from "./money";
import { FINANCING, TIMELINES, type Facts, type Financing, type Timeline } from "./qualification";

/** Types a buyer can pick on the form. */
export const WANT_TYPES = { condominium: "Condo", house_and_lot: "House and lot", townhouse: "Townhouse", lot: "Lot" } as const;
export type WantType = keyof typeof WANT_TYPES;

/** The exact words the buyer agrees to. Saved with the alert as proof of consent; change the wording here only. */
export const CONSENT_TEXT =
  "I agree that MyHomeSeller saves what I'm looking for and my email, and emails me properties that fit, including ones from other sellers. I can stop anytime from any email.";

/** Emails go out at most this often per buyer, with at most this many listings. */
export const EMAIL_EVERY_DAYS = 7;
export const MAX_PER_EMAIL = 5;

export type Wants = {
  types: WantType[];
  budgetMaxMinor: number | null;
  areas: string[];
  timeline: Timeline | null;
  financing: Financing | null;
  consent: boolean;
};

export const WANT_FIELDS = ["wantBudget", "wantAreas", "wantTimeline", "wantFinancing"] as const;

/** Read the optional "what I'm looking for" answers. Returns field errors instead when something doesn't make sense. */
export function parseWants(raw: { types: string[]; budget: string; areas: string; timeline: string; financing: string; consent: boolean; email: string }): { wants: Wants } | { fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const types = [...new Set(raw.types)].filter((t): t is WantType => t in WANT_TYPES);
  const budget = pesosToCentavos(raw.budget);
  if (budget !== null && (Number.isNaN(budget) || budget < 10_000_000 || budget > 500_000_000_000)) fieldErrors.wantBudget = "Enter an amount in pesos, like 5000000";
  const areas = [...new Set(raw.areas.split(/[,\n;]/).map((a) => a.replace(/\s+/g, " ").trim()).filter((a) => a.length >= 2))];
  if (areas.length > 5 || areas.some((a) => a.length > 60)) fieldErrors.wantAreas = "Up to 5 places, separated by commas";
  const timeline = raw.timeline in TIMELINES ? (raw.timeline as Timeline) : null;
  const financing = raw.financing in FINANCING ? (raw.financing as Financing) : null;
  if (raw.consent) {
    if (!raw.email.trim()) fieldErrors.buyerEmail = "Add your email so we can send you matching properties";
    // Matching needs enough to go on.
    const known = Number(types.length > 0) + Number(budget !== null && !fieldErrors.wantBudget) + Number(areas.length > 0);
    if (known < 2) fieldErrors.alertConsent = "Tell us at least two of these first: property type, budget, preferred area";
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  return { wants: { types, budgetMaxMinor: budget, areas, timeline, financing, consent: raw.consent } };
}

/** One line for the seller, added to the inquiry. Empty when the buyer said nothing. */
export function lookingForNote(w: Wants): string {
  const parts = [
    w.types.length ? w.types.map((t) => WANT_TYPES[t]).join(" or ") : null,
    w.budgetMaxMinor !== null ? `up to ${formatPeso(w.budgetMaxMinor)}` : null,
    w.areas.length ? `in ${w.areas.join(", ")}` : null,
    w.timeline ? `buying: ${TIMELINES[w.timeline].toLowerCase()}` : null,
    w.financing ? `paying by: ${FINANCING[w.financing].toLowerCase()}` : null,
  ].filter(Boolean);
  return parts.length ? `Looking for: ${parts.join("; ")}.` : "";
}

/** Add the note to the buyer's message without going over the message limit. */
export function withNote(message: string | undefined, note: string, max = 1000): string | undefined {
  if (!note) return message;
  if (!message) return note.slice(0, max);
  const room = max - note.length - 2;
  return room > 20 ? `${message.slice(0, room)}\n\n${note}` : message;
}

export type Alert = {
  id: string;
  budgetMaxMinor: number | null;
  areas: string[];
  types: string[];
  financing: string | null;
  sourceBusinessId: string | null;
  sourcePropertyId: string | null;
};
export type AlertListing = MatchListing & { id: string; business_id: string; name: string };

/** Paid sellers come first in match emails: Agency, then Pro, then Basic, then Free. */
export function planRank(code: string | undefined): number {
  return code === "agency" ? 3 : code === "pro" ? 2 : code === "basic" ? 1 : 0;
}

/**
 * The listings to email a buyer: they fit the type, budget and area the buyer
 * gave, haven't been sent before, and aren't the listing the buyer already
 * asked about. Paid sellers' listings come first, then the better fit.
 */
export function pickMatches(alert: Alert, listings: AlertListing[], alreadySent: Set<string>, planOf: (businessId: string) => string | undefined, limit = MAX_PER_EMAIL): AlertListing[] {
  const facts: Facts = {
    budget_min_minor: null,
    budget_max_minor: alert.budgetMaxMinor,
    areas: alert.areas,
    property_types: alert.types,
    timeline: null,
    financing: (alert.financing as Financing | null) ?? null,
  };
  const scored: Array<{ l: AlertListing; rank: number; score: number }> = [];
  for (const l of listings) {
    if (l.id === alert.sourcePropertyId || alreadySent.has(l.id)) continue;
    // Never over the budget they gave.
    if (alert.budgetMaxMinor !== null && l.price_minor > alert.budgetMaxMinor) continue;
    const m = scoreMatch(l, facts);
    if (m) scored.push({ l, rank: planRank(planOf(l.business_id)), score: m.score });
  }
  return scored
    .sort((a, b) => b.rank - a.rank || b.score - a.score)
    .slice(0, limit)
    .map((s) => s.l);
}
