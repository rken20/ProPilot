import { formatPeso } from "./money";

/**
 * AI negotiation (Pro and Agency). The owner sets a private lowest price per
 * listing, and can pre-approve an "accept right away" price. The AI is never
 * told either number: each offer a buyer names is checked here, on the server,
 * and the AI only hears what to say next.
 *
 * - At or above the pre-approved price: the AI closes the deal on the spot.
 * - Between the lowest price and that: the AI asks once for more, then the
 *   offer goes to the owner, who confirms or declines.
 * - Under the lowest price: the AI turns it down with a counteroffer. Each
 *   counter gives away a smaller share of the gap than the one before, and
 *   never goes under the lowest price.
 */

/** Offers the AI will check for one listing in one conversation. After that a person takes over, so nobody can probe for the lowest price. */
export const MAX_OFFER_CHECKS = 4;

/** Offer checks on one listing across all chats in a day. Past it a person takes over, so many accounts can't team up to find the lowest price. */
export const OFFERS_PER_LISTING_PER_DAY = 20;

/** Each counter under the lowest price moves this share of the way from our last price toward the buyer's offer: smaller each time. */
export const CONCESSIONS = [0.3, 0.2, 0.1] as const;

export type OfferOutcome = "too_low" | "countered" | "pending" | "accepted";
/** An offer already on record for this conversation. */
export type PriorOffer = { listingId: string; outcome: OfferOutcome | "confirmed" | "declined"; amountMinor: number; counterMinor?: number | null };
/** An offer to record after this turn. */
export type NewOffer = {
  listingId: string;
  amountMinor: number;
  counterMinor: number | null;
  outcome: OfferOutcome;
  name?: string;
  /** For an agreed deal: the reference the server shows the buyer. The AI never sees it, so it can't fake one. */
  ref?: string;
};

export type Floor = {
  /** The lowest price in centavos. */
  min: number;
  /** The "accept right away" price in centavos, or null when the owner confirms every offer. */
  accept: number | null;
};

export type NegotiationContext = {
  /** Listing id → the owner's private prices. Never shown to the model. */
  floors: Record<string, Floor>;
  prior: PriorOffer[];
  /** Listings that already have an agreed deal with another buyer. */
  taken?: string[];
  /** Listings that reached OFFERS_PER_LISTING_PER_DAY today. */
  busy?: string[];
};

export type OfferDecision =
  /** At or above the owner's pre-approved price: the deal is agreed. */
  | { kind: "closed" }
  /** Good enough: send it to the owner. */
  | { kind: "pending" }
  /** Good enough, but ask once for more first. */
  | { kind: "countered"; counterMinor: number }
  /** Under the owner's lowest price. `counterMinor` is the price to offer back; `last` means the checks are used up and a person takes over. */
  | { kind: "too_low"; last: boolean; counterMinor: number | null }
  /** The owner already has an offer from this buyer for this listing. */
  | { kind: "waiting" }
  /** This buyer already has a deal on this listing. */
  | { kind: "accepted" }
  /** Another buyer already has a deal on this listing. */
  | { kind: "taken" }
  /** Probably a typo or the wrong units (far under the price). Doesn't count as a check. */
  | { kind: "unclear" }
  /** A person has to take it from here. */
  | { kind: "handover"; reason: string };

/** A deal reference: 8 letters and digits, without ones that are easy to misread (0/O, 1/I/L). */
export function dealRef(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

/** The deal confirmation the server adds under the AI's reply, once the deal is on record. */
export function dealLine(amountMinor: number, listingName: string, ref: string, language: "taglish" | "english"): string {
  const amount = formatPeso(amountMinor);
  return language === "english"
    ? `✅ Deal recorded: ${amount} for ${listingName}. Reference no. ${ref}. An agent will send the reservation agreement here.`
    : `✅ Naitala na ang deal: ${amount} para sa ${listingName}. Reference no. ${ref}. Ipapadala ng agent dito ang reservation agreement.`;
}

/** What the buyer is told instead when a deal the AI agreed couldn't be recorded. */
export function dealHoldReply(language: "taglish" | "english"): string {
  return language === "english"
    ? "Thank you! An agent will confirm your offer here shortly."
    : "Salamat po! Kukumpirmahin ng agent ang offer ninyo dito sa lalong madaling panahon.";
}

const step = (asking: number) => (asking >= 100_000_000 ? 1_000_000 : 100_000);
/** Prices the AI quotes are rounded up, so rounding never takes one under the lowest price. */
const roundUp = (minor: number, asking: number) => Math.ceil(minor / step(asking)) * step(asking);

/** Decide what happens to one offer. Pure. `prior` is this conversation's earlier offers for the same listing. */
export function decideOffer(o: {
  listingName: string;
  askingMinor: number;
  floorMinor: number | null;
  acceptMinor?: number | null;
  amountMinor: number;
  prior: PriorOffer[];
  taken?: boolean;
  busy?: boolean;
}): OfferDecision {
  const { askingMinor: asking, amountMinor: amount, prior } = o;
  const offer = `${formatPeso(amount)} for ${o.listingName}`;
  if (prior.some((p) => p.outcome === "confirmed" || p.outcome === "accepted")) return { kind: "accepted" };
  if (prior.some((p) => p.outcome === "pending")) return { kind: "waiting" };
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount < asking * 0.1) return { kind: "unclear" };
  if (o.taken) return { kind: "taken" };
  if (o.busy) return { kind: "handover", reason: `The buyer offered ${offer}. This listing had many offers today, so a person takes over the price talk.` };
  if (prior.length >= MAX_OFFER_CHECKS) return { kind: "handover", reason: `The buyer made another offer, ${offer}. The AI stopped negotiating after ${MAX_OFFER_CHECKS} offers.` };

  // A lowest price above the asking price (the price was lowered since) means the asking price is the floor.
  const floor = o.floorMinor === null ? null : Math.min(o.floorMinor, asking);
  const approved = floor !== null && o.acceptMinor != null ? Math.min(Math.max(o.acceptMinor, floor), asking) : null;
  if (approved !== null && amount >= approved) return { kind: "closed" };
  if (amount >= asking) return { kind: "pending" };
  if (floor === null) return { kind: "handover", reason: `The buyer offered ${offer}. No lowest price is set for this listing, so the AI didn't negotiate.` };

  // Our current price: the asking price, or the lowest counter already given in this chat.
  const counters = prior.flatMap((p) => (p.counterMinor ? [p.counterMinor] : []));
  const position = Math.min(asking, ...counters);

  if (amount < floor) {
    if (prior.length + 1 >= MAX_OFFER_CHECKS) return { kind: "too_low", last: true, counterMinor: null };
    // Move a shrinking share of the way toward their offer, but never under the lowest price: if it would, hold at our price.
    const share = CONCESSIONS[Math.min(counters.length, CONCESSIONS.length - 1)]!;
    const proposed = roundUp(position - (position - amount) * share, asking);
    return { kind: "too_low", last: false, counterMinor: proposed >= floor && proposed < position ? proposed : position };
  }

  // At or above the lowest price: ask once to meet in the middle, then it's their final offer.
  if (prior.some((p) => p.outcome === "countered")) return { kind: "pending" };
  const counter = roundUp((amount + position) / 2, asking);
  if (counter <= amount || counter > asking || position - amount < 2 * step(asking)) return { kind: "pending" };
  return { kind: "countered", counterMinor: counter };
}

/** What the owner's decision tells the buyer. The owner sees this text before choosing. */
export function decisionMessage(confirm: boolean, amountMinor: number, listingName: string, language: "taglish" | "english"): string {
  const amount = formatPeso(amountMinor);
  if (language === "english") {
    return confirm
      ? `Good news! The owner accepted your offer of ${amount} for ${listingName}. We'll message you here about the next steps.`
      : `Thank you for your offer of ${amount} for ${listingName}. The owner can't accept it. You're welcome to send another offer.`;
  }
  return confirm
    ? `Good news po! Tinanggap ng owner ang offer ninyong ${amount} para sa ${listingName}. Imemessage po namin kayo dito para sa next steps.`
    : `Salamat po sa offer ninyong ${amount} para sa ${listingName}. Hindi po ito matanggap ng owner sa ngayon. Pwede po kayong magpadala ng bagong offer.`;
}
