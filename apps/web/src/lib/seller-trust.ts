import { SELLER_CAPACITIES, type SellerCapacity } from "@propilot/shared";
import type { Say } from "@/lib/lang";

/**
 * How a seller says they are listing a property, and how a public page shows
 * it. Everything here is the seller's own word: only the "Verified seller"
 * mark means MyHomeSeller checked anything.
 */

/** On the form, as the seller reads it. */
export const CAPACITY_LABEL: Record<SellerCapacity, string> = {
  owner: "I own this property",
  broker: "I'm a licensed real estate broker",
  agent: "I'm a real estate agent or salesperson",
  developer: "We're the developer",
};

/** The licence number that goes with each way of listing. An owner needs none. */
export const LICENSE_LABEL: Record<Exclude<SellerCapacity, "owner">, string> = {
  broker: "PRC broker licence number",
  agent: "PRC accreditation number, or your broker's PRC licence number",
  developer: "DHSUD Licence to Sell number",
};

export const isCapacity = (v: unknown): v is SellerCapacity =>
  typeof v === "string" && (SELLER_CAPACITIES as readonly string[]).includes(v);

export type SellerInfo = {
  /** Null on listings made before the declaration was asked for. */
  capacity: SellerCapacity | null;
  license: string | null;
  /** MyHomeSeller checked this seller's proof. */
  verified: boolean;
};

/** A public page's line for the seller's declaration: what they said, not what was checked. */
export function declarationLine(
  seller: Pick<SellerInfo, "capacity" | "license">,
  say: Say,
): string | null {
  const no = seller.license ? ` ${seller.license}` : "";
  switch (seller.capacity) {
    case "owner":
      return say(
        "The seller says they own this property.",
        "Sabi ng seller, sila ang may-ari ng property na ito.",
      );
    case "broker":
      return say(
        `The seller says they are a licensed real estate broker, PRC licence no.${no}.`,
        `Sabi ng seller, licensed real estate broker sila, PRC licence no.${no}.`,
      );
    case "agent":
      return say(
        `The seller says they are a real estate agent, PRC no.${no}.`,
        `Sabi ng seller, real estate agent sila, PRC no.${no}.`,
      );
    case "developer":
      return say(
        `The seller says they are the developer, DHSUD Licence to Sell no.${no}.`,
        `Sabi ng seller, sila ang developer, DHSUD Licence to Sell no.${no}.`,
      );
    default:
      return null;
  }
}

/** Why a visitor is reporting a listing, in the order the form shows them. */
export const REPORT_REASONS = [
  "not_real",
  "pay_first",
  "misleading",
  "copied",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABEL: Record<
  ReportReason,
  [en: string, tl: string]
> = {
  not_real: [
    "The property doesn't exist, or isn't theirs to sell",
    "Walang ganitong property, o hindi sa kanila para ibenta",
  ],
  pay_first: [
    "I was asked to pay before a viewing",
    "Pinagbayad ako bago mag-viewing",
  ],
  misleading: [
    "The photos or details are false",
    "Hindi totoo ang photos o details",
  ],
  copied: [
    "It's copied from another listing",
    "Kinopya ito mula sa ibang listing",
  ],
  other: ["Something else", "Iba pa"],
};

/** Every reason a report can carry, as the app admin reads it. */
export const ANY_REASON_LABEL: Record<string, string> = {
  not_real: "Doesn't exist, or isn't theirs to sell",
  pay_first: "Asked to pay before a viewing",
  misleading: "Photos or details are false",
  copied: "Copied from another listing",
  other: "Something else",
  auto_price: "Price far below similar listings",
  auto_wording: "Wording asks for payment first",
  auto_photos: "Same photos as another seller",
};
