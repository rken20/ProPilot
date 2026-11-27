import { describe, expect, it } from "vitest";
import { financingPlan, financingPlans, lowestDownPercent } from "./financing";

const PRICE = 500_000_000; // ₱5,000,000

describe("financing options on a listing", () => {
  it("computes the seller's own terms", () => {
    const p = financingPlan(PRICE, "bank", {
      downPercent: 20,
      ratePercent: 7.5,
      years: 20,
    })!;
    expect(p.sellerSet).toBe(true);
    expect(p.downpaymentMinor).toBe(100_000_000);
    expect(p.loanMinor).toBe(400_000_000);
    // ₱4,000,000 at 7.5% for 20 years is ₱32,223.73 a month.
    expect(p.monthlyMinor).toBe(3_222_373);
    expect(p.months).toBe(240);
    // The payment is 35% of this income.
    expect(Math.round((p.monthlyMinor / p.incomeGuideMinor) * 100)).toBe(35);
  });

  it("uses example figures where a term is empty, and says so", () => {
    const p = financingPlan(PRICE, "pagibig", { downPercent: 15 })!;
    expect(p.sellerSet).toBe(false);
    expect([p.downPercent, p.ratePercent, p.years]).toEqual([15, 6.25, 30]);
  });

  it("spreads an in-house downpayment over the months allowed", () => {
    const p = financingPlan(PRICE, "inHouse", {
      downPercent: 20,
      ratePercent: 12,
      years: 10,
      downMonths: 24,
    })!;
    expect(p.downMonthlyMinor).toBe(Math.round(100_000_000 / 24));
    // Only in-house has a downpayment schedule.
    expect(
      financingPlan(PRICE, "bank", { downMonths: 24 })!.downMonthlyMinor,
    ).toBeNull();
  });

  it("handles a zero-interest term", () => {
    const p = financingPlan(PRICE, "inHouse", {
      downPercent: 50,
      ratePercent: 0,
      years: 5,
    })!;
    expect(p.monthlyMinor).toBe(Math.round(250_000_000 / 60));
  });

  it("returns nothing for numbers out of range", () => {
    expect(
      financingPlan(PRICE, "bank", { ratePercent: 80, years: 20 }),
    ).toBeNull();
    expect(
      financingPlan(PRICE, "bank", { ratePercent: 7, years: 0 }),
    ).toBeNull();
  });

  it("lists only the options offered, in order, falling back to the general downpayment", () => {
    const plans = financingPlans(PRICE, {
      inHouse: true,
      bankFinancing: true,
      downpaymentPercent: 30,
      terms: { inHouse: { downPercent: 25 } },
    });
    expect(plans.map((p) => p.key)).toEqual(["bank", "inHouse"]);
    expect(plans.map((p) => p.downPercent)).toEqual([30, 25]);
    expect(financingPlans(PRICE, null)).toEqual([]);
  });

  it("finds the lowest stated downpayment among offered options", () => {
    expect(
      lowestDownPercent({
        bankFinancing: true,
        pagIbig: true,
        terms: {
          bank: { downPercent: 20 },
          pagibig: { downPercent: 10 },
          inHouse: { downPercent: 5 },
        },
      }),
    ).toBe(10);
    expect(lowestDownPercent({ bankFinancing: true })).toBeUndefined();
  });
});
