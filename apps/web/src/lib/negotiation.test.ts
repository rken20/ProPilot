import { describe, expect, it } from "vitest";
import { MAX_OFFER_CHECKS, decideOffer, decisionMessage, type PriorOffer } from "./negotiation";

// Asking ₱5,000,000; the owner would take ₱4,500,000.
const base = { listingName: "Velmiro Homes", askingMinor: 500_000_000, floorMinor: 450_000_000 as number | null, prior: [] as PriorOffer[] };
const prior = (outcome: PriorOffer["outcome"], amountMinor = 400_000_000, counterMinor: number | null = null): PriorOffer => ({ listingId: "1", outcome, amountMinor, counterMinor });

describe("an offer", () => {
  it("under the owner's lowest price gets a counteroffer, never under the lowest price", () => {
    // ₱3M against ₱5M: move 30% of the ₱2M gap, to ₱4.4M, which is under the ₱4.5M lowest price, so hold at the asking price.
    expect(decideOffer({ ...base, amountMinor: 300_000_000 })).toEqual({ kind: "too_low", last: false, counterMinor: 500_000_000 });
    // ₱4.2M: 30% of the ₱800k gap is ₱240k, so counter at ₱4.76M.
    expect(decideOffer({ ...base, amountMinor: 420_000_000 })).toEqual({ kind: "too_low", last: false, counterMinor: 476_000_000 });
  });

  it("gives away less with each counter", () => {
    const first = decideOffer({ ...base, amountMinor: 420_000_000 });
    expect(first).toMatchObject({ counterMinor: 476_000_000 });
    // From ₱4.76M toward ₱4.3M, 20% of the ₱460k gap: ₱92k, so ₱4.668M rounds up to ₱4.67M.
    const second = decideOffer({ ...base, amountMinor: 430_000_000, prior: [prior("too_low", 420_000_000, 476_000_000)] });
    expect(second).toEqual({ kind: "too_low", last: false, counterMinor: 467_000_000 });
    expect(500_000_000 - 476_000_000).toBeGreaterThan(476_000_000 - 467_000_000);
  });

  it("never quotes a counter under the lowest price, whatever the offers", () => {
    for (const floor of [400_000_000, 450_000_000, 480_000_000, 499_000_000]) {
      let history: PriorOffer[] = [];
      for (const amount of [200_000_000, 350_000_000, 390_000_000]) {
        const d = decideOffer({ ...base, floorMinor: floor, amountMinor: amount, prior: history });
        if (d.kind === "too_low" && d.counterMinor !== null) {
          expect(d.counterMinor).toBeGreaterThanOrEqual(floor);
          expect(d.counterMinor).toBeLessThanOrEqual(base.askingMinor);
          history = [...history, prior("too_low", amount, d.counterMinor)];
        }
      }
    }
  });

  it("at or above the lowest price is first asked to meet in the middle, once", () => {
    expect(decideOffer({ ...base, amountMinor: 460_000_000 })).toEqual({ kind: "countered", counterMinor: 480_000_000 });
    expect(decideOffer({ ...base, amountMinor: 460_000_000, prior: [prior("countered", 460_000_000, 480_000_000)] })).toEqual({ kind: "pending" });
  });

  it("meets in the middle from the last counter given, not the asking price", () => {
    // We already came down to ₱4.76M; they offer ₱4.6M: the middle is ₱4.68M.
    expect(decideOffer({ ...base, amountMinor: 460_000_000, prior: [prior("too_low", 420_000_000, 476_000_000)] })).toEqual({ kind: "countered", counterMinor: 468_000_000 });
  });

  it("that takes our counter goes to the owner", () => {
    expect(decideOffer({ ...base, amountMinor: 476_000_000, prior: [prior("too_low", 420_000_000, 476_000_000)] })).toEqual({ kind: "pending" });
  });

  it("goes straight to the owner at the asking price, or when there's no real room left", () => {
    expect(decideOffer({ ...base, amountMinor: 500_000_000 })).toEqual({ kind: "pending" });
    expect(decideOffer({ ...base, amountMinor: 520_000_000 })).toEqual({ kind: "pending" });
    expect(decideOffer({ ...base, amountMinor: 499_000_000 })).toEqual({ kind: "pending" });
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
    const three = [prior("too_low", 400_000_000, 500_000_000), prior("too_low", 410_000_000, 500_000_000), prior("too_low", 420_000_000, 500_000_000)];
    expect(decideOffer({ ...base, amountMinor: 440_000_000, prior: three })).toEqual({ kind: "too_low", last: true, counterMinor: null });
    const four = [...three, prior("too_low", 440_000_000)];
    expect(four).toHaveLength(MAX_OFFER_CHECKS);
    // Even an acceptable offer isn't checked any more.
    expect(decideOffer({ ...base, amountMinor: 460_000_000, prior: four }).kind).toBe("handover");
  });

  it("isn't rechecked while the owner is deciding, or after a deal", () => {
    expect(decideOffer({ ...base, amountMinor: 300_000_000, prior: [prior("pending", 470_000_000)] })).toEqual({ kind: "waiting" });
    expect(decideOffer({ ...base, amountMinor: 300_000_000, prior: [prior("confirmed", 470_000_000)] })).toEqual({ kind: "accepted" });
    expect(decideOffer({ ...base, amountMinor: 300_000_000, prior: [prior("accepted", 490_000_000)] })).toEqual({ kind: "accepted" });
  });

  it("that looks like a typo doesn't count", () => {
    expect(decideOffer({ ...base, amountMinor: 450 })).toEqual({ kind: "unclear" });
    expect(decideOffer({ ...base, amountMinor: Number.NaN })).toEqual({ kind: "unclear" });
  });
});

describe("the owner's pre-approved price", () => {
  // The owner pre-approves ₱4.8M.
  const pre = { ...base, acceptMinor: 480_000_000 };

  it("closes the deal at or above it, with no waiting for the owner", () => {
    expect(decideOffer({ ...pre, amountMinor: 480_000_000 })).toEqual({ kind: "closed" });
    expect(decideOffer({ ...pre, amountMinor: 500_000_000 })).toEqual({ kind: "closed" });
  });

  it("closes when the buyer takes a counter that reaches it", () => {
    // ₱4.6M is countered at ₱4.8M; the buyer says yes.
    expect(decideOffer({ ...pre, amountMinor: 460_000_000 })).toEqual({ kind: "countered", counterMinor: 480_000_000 });
    expect(decideOffer({ ...pre, amountMinor: 480_000_000, prior: [prior("countered", 460_000_000, 480_000_000)] })).toEqual({ kind: "closed" });
  });

  it("still sends offers between the lowest price and it to the owner", () => {
    expect(decideOffer({ ...pre, amountMinor: 470_000_000, prior: [prior("countered", 460_000_000, 480_000_000)] })).toEqual({ kind: "pending" });
  });

  it("is kept between the lowest price and the asking price", () => {
    expect(decideOffer({ ...base, acceptMinor: 400_000_000, amountMinor: 449_000_000 }).kind).toBe("too_low");
    expect(decideOffer({ ...base, acceptMinor: 400_000_000, amountMinor: 450_000_000 })).toEqual({ kind: "closed" });
    expect(decideOffer({ ...base, acceptMinor: 600_000_000, amountMinor: 500_000_000 })).toEqual({ kind: "closed" });
  });

  it("does nothing without a lowest price", () => {
    expect(decideOffer({ ...base, floorMinor: null, acceptMinor: 480_000_000, amountMinor: 490_000_000 }).kind).toBe("handover");
  });

  it("can't close a second deal on a listing another buyer already has", () => {
    expect(decideOffer({ ...pre, amountMinor: 500_000_000, taken: true })).toEqual({ kind: "taken" });
  });
});

describe("the owner's answer", () => {
  it("is written for the buyer in the chat's language", () => {
    expect(decisionMessage(true, 470_000_000, "Velmiro Homes", "english")).toContain("accepted your offer of ₱4,700,000 for Velmiro Homes");
    expect(decisionMessage(true, 470_000_000, "Velmiro Homes", "taglish")).toContain("Tinanggap ng owner");
    expect(decisionMessage(false, 470_000_000, "Velmiro Homes", "english")).toContain("can't accept");
  });
});
