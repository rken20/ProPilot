import { describe, expect, it } from "vitest";
import { centavosToPesosInput, formatPeso, pesosToCentavos } from "./money";

describe("pesosToCentavos", () => {
  it("parses plain, comma and peso-sign input", () => {
    expect(pesosToCentavos("4500000")).toBe(450000000);
    expect(pesosToCentavos("₱4,500,000")).toBe(450000000);
    expect(pesosToCentavos("25000.5")).toBe(2500050);
    expect(pesosToCentavos("25000.05")).toBe(2500005);
  });

  it("returns null for empty and NaN for junk", () => {
    expect(pesosToCentavos("")).toBeNull();
    expect(pesosToCentavos("abc")).toBeNaN();
    expect(pesosToCentavos("1.234")).toBeNaN();
    expect(pesosToCentavos("-5")).toBeNaN();
  });

  it("round-trips through the edit form", () => {
    for (const v of [0, 1, 99, 100, 2500005, 450000000]) {
      expect(pesosToCentavos(centavosToPesosInput(v))).toBe(v);
    }
  });
});

describe("formatPeso", () => {
  it("formats whole pesos without decimals", () => {
    expect(formatPeso(450000000)).toBe("₱4,500,000");
    expect(formatPeso(null)).toBe("—");
  });
});
