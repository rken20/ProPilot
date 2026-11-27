/**
 * AI credits: what they pay for and when they're needed. Pure, so the server,
 * the Billing page and the tests share one rule. Packs and prices live in the
 * `credit_packs` table (owner's decision, 27 Nov 2026).
 */
import type { Say } from "./lang";

/** Credits a use takes once the plan's monthly allowance for it is used up. */
export const CREDIT_COST = { reply: 1, ask: 2 } as const;
export type CreditFeature = keyof typeof CREDIT_COST;

/**
 * Credits this use needs: none while the month's allowance lasts (or when it
 * has no limit), the feature's cost once `used` has reached the limit.
 */
export function creditsNeeded(
  feature: CreditFeature,
  used: number,
  limit: number | null,
): number {
  if (limit === null || used < limit) return 0;
  return CREDIT_COST[feature];
}

export type CreditPack = {
  code: string;
  credits: number;
  priceMinor: number;
  validMonths: number;
};

/** Pesos per 1,000 credits, rounded down to the centavo, to compare packs. */
export function perThousand(
  pack: Pick<CreditPack, "credits" | "priceMinor">,
): number {
  return Math.floor((pack.priceMinor * 1000) / pack.credits);
}

const n = (v: number) => v.toLocaleString("en-PH");

/** What a pack buys, in one line: "1,000 AI replies, or 500 Ask MyHomeSeller questions". */
export function packBuys(
  credits: number,
  say: Say = (english) => english,
): string {
  const ask = Math.floor(credits / CREDIT_COST.ask);
  return say(
    `${n(credits)} AI replies, or ${n(ask)} Ask MyHomeSeller questions`,
    `${n(credits)} AI replies, o ${n(ask)} tanong sa Ask MyHomeSeller`,
  );
}

/** "1,000 AI credits" */
export const creditsLabel = (credits: number) => `${n(credits)} AI credits`;

/** What a payment bought, for payment lists: "Pro, 3 months" or "1,000 AI credits". */
export function paymentItem(
  p: {
    months: number;
    plans?: { name: string } | null;
    credit_packs?: { credits: number } | null;
  },
  short = false,
): string {
  if (p.credit_packs) return creditsLabel(p.credit_packs.credits);
  const name = p.plans?.name ?? "Plan";
  return short
    ? `${name}, ${p.months} mo`
    : `${name}, ${p.months} month${p.months === 1 ? "" : "s"}`;
}
