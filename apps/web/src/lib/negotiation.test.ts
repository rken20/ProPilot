import { describe, expect, it } from "vitest";
import { MAX_OFFER_CHECKS, decideOffer, decisionMessage, type PriorOffer } from "./negotiation";

// Asking ₱5,000,000; the owner would take ₱4,500,000.
const base = { listingName: "Velmiro Homes", askingMinor: 500_000_000, floorMinor: 450_000_000 as number | null, prior: [] as PriorOffer[] };
const prior = (outcome: PriorOffer["outcome"], amountMinor = 400_000_000): PriorOffer => ({ listingId: "1", outcome, amountMinor });

describe("an offer", () => {
  it("under the owner's lowest price is too low", () => {
    expect(decideOffer({ ...base, amountMinor: 449_900_000 })).toEqual({ kind: "too_low", last: false });
  });

  it("at or above the lowest price is first asked for the midpoint, once", () => {
    expect(decideOffer({ ...base, amountMinor: 460_000_000 })).toEqual({ kind: "countered", counterMinor: 480_000_000 });
    expect(decideOffer({ ...base, amountMinor: 460_000_000, prior: [prior("countered", 460_000_000)] })).toEqual({ kind: "pending" });
  });

  it("goes straight to the owner at the asking price, or when there's no real room left", () => {
    expect(decideOffer({ ...base, amountMinor: 500_000_000 })).toEqual({ kind: "pending" });
    expect(decideOffer({ ...base, amountMinor: 520_000_000 })).toEqual({ kind: "pending" });
    expect(decideOffer({ ...base, amountMinor: 499_000_000 })).toEqual({ kind: "pending" });
  });

  it("never counters above the asking price or at the offer itself", () => {
    for (const amount of [450_000_000, 470_000_000, 485_000_000, 497_000_000]) {
      const d = decideOffer({ ...base, amountMinor: amount });
      if (d.kind === "countered") {
        expect(d.counterMinor).toBeGreaterThan(amount);
        expect(d.counterMinor).toBeLessThanOrEqual(base.askingMinor);
      }
    }
  });

  it("goes to a person when no lowest price is set, unless it meets the asking price", () => {
    expect(decideOffer({ ...base, floorMinor: null, amountMinor: 480_000_000 }).kind).toBe("handover");
    expect(decideOffer({ ...base, floorMinor: null, amountMinor: 500_000_000 })).toEqual({ kind: "pending" });
  });

  it("treats a lowest price above the asking price as the asking price", () => {
    expect(decideOffer({ ...base, floorMinor: 600_000_000, amountMinor: 490_000_000 }).kind).toBe("too_low");
    expect(decideOffer({ ...base, floorMinor: 600_000_000, amountMinor: 500_000_000 })).toEqual({ kind: "pending" });
  });

  it("can't be used to probe for the lowest price: a person takes over after a few tries", () => {
    const two = [prior("too_low"), prior("too_low", 420_000_000)];
    expect(decideOffer({ ...base, amountMinor: 440_000_000, prior: two })).toEqual({ kind: "too_low", last: true });
    const three = [...two, prior("too_low", 440_000_000)];
    expect(three).toHaveLength(MAX_OFFER_CHECKS);
    // Even an acceptable offer isn't checked any more.
    expect(decideOffer({ ...base, amountMinor: 460_000_000, prior: three }).kind).toBe("handover");
  });

  it("isn't rechecked while the owner is deciding, or after the owner accepted", () => {
    expect(decideOffer({ ...base, amountMinor: 300_000_000, prior: [prior("pending", 470_000_000)] })).toEqual({ kind: "waiting" });
    expect(decideOffer({ ...base, amountMinor: 300_000_000, prior: [prior("confirmed", 470_000_000)] })).toEqual({ kind: "accepted" });
  });

  it("that looks like a typo doesn't count", () => {
    expect(decideOffer({ ...base, amountMinor: 450 })).toEqual({ kind: "unclear" });
    expect(decideOffer({ ...base, amountMinor: Number.NaN })).toEqual({ kind: "unclear" });
  });
});

describe("the owner's answer", () => {
  it("is written for the buyer in the chat's language", () => {
    expect(decisionMessage(true, 470_000_000, "Velmiro Homes", "english")).toContain("accepted your offer of ₱4,700,000 for Velmiro Homes");
    expect(decisionMessage(true, 470_000_000, "Velmiro Homes", "taglish")).toContain("Tinanggap ng owner");
    expect(decisionMessage(false, 470_000_000, "Velmiro Homes", "english")).toContain("can't accept");
  });
});
