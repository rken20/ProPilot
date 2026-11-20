import { formatPeso } from "./money";

/**
 * AI negotiation (Pro and Agency). The owner sets a private lowest price per
 * listing. The AI is never told that number: each offer a buyer names is checked
 * here, on the server, and the AI only hears what to say next. An acceptable
 * offer is sent to the owner, who confirms or declines. Nothing is final before that.
 */

/** Offers the AI will check for one listing in one conversation. After that a person takes over, so nobody can probe for the lowest price. */
export const MAX_OFFER_CHECKS = 3;

export type OfferOutcome = "too_low" | "countered" | "pending";
/** An offer already on record for this conversation. */
export type PriorOffer = { listingId: string; outcome: OfferOutcome | "confirmed" | "declined"; amountMinor: number };
/** An offer to record after this turn. */
export type NewOffer = { listingId: string; amountMinor: number; counterMinor: number | null; outcome: OfferOutcome; name?: string };

export type NegotiationContext = {
  /** Listing id → the owner's lowest price in centavos. Never shown to the model. */
  floors: Record<string, number>;
  prior: PriorOffer[];
};

export type OfferDecision =
  /** Good enough: send it to the owner. */
  | { kind: "pending" }
  /** Good enough, but ask once for more first. */
  | { kind: "countered"; counterMinor: number }
  /** Under the owner's lowest price. `last` means the checks are used up and a person takes over. */
  | { kind: "too_low"; last: boolean }
  /** The owner already has an offer from this buyer for this listing. */
  | { kind: "waiting" }
  /** The owner already accepted this buyer's offer. */
  | { kind: "accepted" }
  /** Probably a typo or the wrong units (far under the price). Doesn't count as a check. */
  | { kind: "unclear" }
  /** A person has to take it from here. */
  | { kind: "handover"; reason: string };

const step = (asking: number) => (asking >= 100_000_000 ? 1_000_000 : 100_000);

/** Decide what happens to one offer. Pure. `prior` is this conversation's earlier offers for the same listing. */
export function decideOffer(o: { listingName: string; askingMinor: number; floorMinor: number | null; amountMinor: number; prior: PriorOffer[] }): OfferDecision {
  const { askingMinor: asking, amountMinor: amount, prior } = o;
  const offer = `${formatPeso(amount)} for ${o.listingName}`;
  if (prior.some((p) => p.outcome === "confirmed")) return { kind: "accepted" };
  if (prior.some((p) => p.outcome === "pending")) return { kind: "waiting" };
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount < asking * 0.1) return { kind: "unclear" };
  if (prior.length >= MAX_OFFER_CHECKS) return { kind: "handover", reason: `The buyer made another offer, ${offer}. The AI stopped negotiating after ${MAX_OFFER_CHECKS} offers.` };
  if (amount >= asking) return { kind: "pending" };
  if (o.floorMinor === null) return { kind: "handover", reason: `The buyer offered ${offer}. No lowest price is set for this listing, so the AI didn't negotiate.` };

  // A lowest price above the asking price (the price was lowered since) means the asking price is the floor.
  const floor = Math.min(o.floorMinor, asking);
  if (amount < floor) return { kind: "too_low", last: prior.length + 1 >= MAX_OFFER_CHECKS };
  if (prior.some((p) => p.outcome === "countered")) return { kind: "pending" };
  // Ask once for the midpoint between their offer and the asking price, if there's real room.
  const s = step(asking);
  const counter = Math.ceil((amount + asking) / 2 / s) * s;
  if (counter <= amount || counter > asking || asking - amount < 2 * s) return { kind: "pending" };
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
