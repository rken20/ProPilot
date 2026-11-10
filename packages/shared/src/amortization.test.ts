import { describe, expect, it } from "vitest";
import { amortize } from "./amortization";

describe("amortize", () => {
  it("matches the standard formula", () => {
    // ₱4,500,000, 20% down, 6.5% for 20 years → loan ₱3,600,000, about ₱26,840/month
    const r = amortize({ priceMinor: 450_000_000, downpaymentPercent: 20, annualRatePercent: 6.5, years: 20 });
    expect(r.downpaymentMinor).toBe(90_000_000);
    expect(r.loanMinor).toBe(360_000_000);
    expect(r.months).toBe(240);
    expect(Math.round(r.monthlyMinor / 100)).toBe(26_841);
  });

  it("handles zero interest", () => {
    const r = amortize({ priceMinor: 120_000_00, downpaymentPercent: 0, annualRatePercent: 0, years: 1 });
    expect(r.monthlyMinor).toBe(10_000_00);
    expect(r.totalInterestMinor).toBe(0);
  });

  it("rejects impossible inputs", () => {
    expect(() => amortize({ priceMinor: 1, downpaymentPercent: 120, annualRatePercent: 5, years: 10 })).toThrow();
    expect(() => amortize({ priceMinor: 1, downpaymentPercent: 10, annualRatePercent: 5, years: 0 })).toThrow();
  });
});
