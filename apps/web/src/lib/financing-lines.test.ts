import { describe, expect, it } from "vitest";
import { financingTermLines } from "./messenger-assistant";

describe("financing terms given to the AI", () => {
  it("states only the options whose interest and years the seller entered, with the payment worked out", () => {
    const lines = financingTermLines(500_000_000, {
      bankFinancing: true,
      pagIbig: true,
      inHouse: true,
      terms: {
        bank: { downPercent: 20, ratePercent: 7.5, years: 20 },
        pagibig: { downPercent: 10 },
        inHouse: {
          downPercent: 20,
          ratePercent: 12,
          years: 10,
          downMonths: 24,
        },
      },
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(
      "Bank financing terms from the seller: 20% downpayment (₱1,000,000), 7.5% interest a year, 20 years: about ₱32,224 a month",
    );
    expect(lines[1]).toContain(
      "payable over 24 months at about ₱41,667 a month",
    );
    expect(lines[1]).toContain("about ₱57,388 a month");
    // Pag-IBIG has no rate from the seller, so the AI is given no figure for it.
    expect(lines.join(" ")).not.toContain("Pag-IBIG terms");
  });

  it("adds nothing when the seller gave no terms", () => {
    expect(financingTermLines(500_000_000, { bankFinancing: true })).toEqual(
      [],
    );
  });
});
