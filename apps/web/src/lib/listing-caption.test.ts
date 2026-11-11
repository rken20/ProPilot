import { describe, expect, it } from "vitest";
import { defaultCaption } from "./listing-caption";

describe("defaultCaption", () => {
  it("lists the facts buyers ask about first", () => {
    const c = defaultCaption({
      name: "2BR corner unit",
      type: "condominium",
      location: "Mandaluyong",
      price_minor: 480000000,
      reservation_fee_minor: 2000000,
      status: "available",
      financing: { pagIbig: true, bankFinancing: true, downpaymentPercent: 20 },
      description: "Ready for occupancy.",
    });
    expect(c).toContain("For sale: 2BR corner unit");
    expect(c).toContain("Condominium in Mandaluyong");
    expect(c).toMatch(/Price: ₱4,800,000/);
    expect(c).toContain("Payment: bank financing, Pag-IBIG");
    expect(c).toContain("Downpayment: 20%");
    expect(c).toContain("Ready for occupancy.");
  });

  it("skips what isn't there and trims long descriptions", () => {
    const c = defaultCaption({
      name: "Lot",
      type: "lot",
      location: "Cavite",
      price_minor: 100000000,
      reservation_fee_minor: null,
      status: "reserved",
      financing: null,
      description: "word ".repeat(400),
    });
    expect(c).toMatch(/^Reserved: Lot/);
    expect(c).not.toContain("Reservation fee");
    expect(c).toContain("…");
  });
});
