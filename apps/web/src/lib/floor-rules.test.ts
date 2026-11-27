import { describe, expect, it } from "vitest";
import { checkFloor, floorProblem } from "./floor-rules";

const ASKING = 500_000_000; // ₱5,000,000 in centavos

describe("the AI's private prices", () => {
  it("requires the lowest price on plans with AI negotiation", () => {
    const got = checkFloor("", "", ASKING, true);
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.field).toBe("lowestPrice");
  });

  it("lets plans without negotiation leave both empty", () => {
    expect(checkFloor("", "", ASKING, false)).toEqual({
      ok: true,
      floor: null,
    });
  });

  it("saves the lowest price alone, or with a price to close at", () => {
    expect(checkFloor("4,500,000", "", ASKING, true)).toEqual({
      ok: true,
      floor: { minMinor: 450_000_000, acceptMinor: null },
    });
    expect(checkFloor("4500000", "4800000", ASKING, true)).toEqual({
      ok: true,
      floor: { minMinor: 450_000_000, acceptMinor: 480_000_000 },
    });
    // At the asking price is allowed: the AI then holds the price.
    expect(checkFloor("5000000", "5000000", ASKING, true).ok).toBe(true);
  });

  it("refuses amounts that aren't pesos, or are out of order", () => {
    const field = (l: string, a: string) => {
      const r = checkFloor(l, a, ASKING, true);
      return r.ok ? null : r.field;
    };
    expect(field("abc", "")).toBe("lowestPrice");
    expect(field("0", "")).toBe("lowestPrice");
    expect(field("5000001", "")).toBe("lowestPrice");
    expect(field("4500000", "4000000")).toBe("acceptPrice");
    expect(field("4500000", "5500000")).toBe("acceptPrice");
    expect(field("4500000", "x")).toBe("acceptPrice");
    expect(field("", "4800000")).toBe("lowestPrice");
  });

  it("asks for the lowest price first when only the close price is filled on an optional form", () => {
    const got = checkFloor("", "4800000", ASKING, false);
    expect(got.ok ? null : got.field).toBe("acceptPrice");
  });

  it("flags for-sale listings with no lowest price, or one above a lowered asking price", () => {
    expect(floorProblem("available", null, ASKING)).toBe("missing");
    expect(floorProblem("available", 520_000_000, ASKING)).toBe("above-asking");
    expect(floorProblem("available", 450_000_000, ASKING)).toBeNull();
    expect(floorProblem("reserved", null, ASKING)).toBeNull();
    expect(floorProblem("sold", null, ASKING)).toBeNull();
  });
});
