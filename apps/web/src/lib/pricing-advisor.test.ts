import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { buildReport, normalizeUrl, pricingInputSchema, pricingPrompt, researchPrice, roundPrice, samePricingInput, type PricingInput } from "./pricing-advisor";

const condo: PricingInput = pricingInputSchema.parse({ location: "Mandurriao, Iloilo City", type: "condominium", floorArea: "50", bedrooms: "2", bathrooms: "1", condition: "good" });
const ownUrl = (id: string) => `/l/${id}`;
const site = (n: number) => `https://portal.example/listing/${n}`;
// Six condos at ₱100k, 110k, 120k, 130k, 140k and 150k per sqm.
const six = [100, 110, 120, 130, 140, 150].map((k, i) => ({ title: `Condo ${i + 1}`, url: site(i + 1), price_php: k * 1000 * 40, floor_area_sqm: 40, location: "Mandurriao" }));
const urls = six.map((c) => c.url);

describe("the form", () => {
  it("needs a floor area, except for a lot, which needs its lot area", () => {
    expect(pricingInputSchema.safeParse({ location: "Pavia, Iloilo", type: "house_and_lot" }).success).toBe(false);
    expect(pricingInputSchema.safeParse({ location: "Pavia, Iloilo", type: "lot", floorArea: "80" }).success).toBe(false);
    const lot = pricingInputSchema.parse({ location: "Pavia, Iloilo", type: "lot", lotArea: "1,200", bedrooms: "" });
    expect(lot.lotArea).toBe(1200);
    expect(lot.bedrooms).toBeUndefined();
    expect(lot.condition).toBe("good");
  });
});

describe("the report", () => {
  it("works out price per square meter, the range and the three options from the comparables", () => {
    const r = buildReport(condo, { comparables: six, adjustment_percent: 0, adjustment_reason: "Typical for the area." }, urls, [], ownUrl)!;
    expect(r.basis).toBe("comparables");
    expect(r.confidence).toBe("good");
    // Quartiles of 100k..150k per sqm, in centavos.
    expect(r.pricePerSqm).toEqual({ low: 11_250_000, median: 12_500_000, high: 13_750_000, count: 6, of: "floor" });
    // 50 sqm at the median: ₱6,250,000.
    expect(r.options.market).toBe(625_000_000);
    expect(r.options.fast).toBe(roundPrice(625_000_000 * 0.95));
    expect(r.options.premium).toBe(roundPrice(625_000_000 * 1.07));
    expect(r.range).toEqual({ low: roundPrice(11_250_000 * 50), high: roundPrice(13_750_000 * 50) });
    expect(r.options.fast).toBeLessThan(r.options.market);
    expect(r.options.premium).toBeGreaterThan(r.options.market);
  });

  it("applies the AI's nudge, capped at 15% either way", () => {
    const up = buildReport(condo, { comparables: six, adjustment_percent: 10, adjustment_reason: "Newly renovated." }, urls, [], ownUrl)!;
    expect(up.options.market).toBe(roundPrice(12_500_000 * 50 * 1.1));
    const wild = buildReport(condo, { comparables: six, adjustment_percent: 80, adjustment_reason: "x" }, urls, [], ownUrl)!;
    expect(wild.adjustment.percent).toBe(15);
  });

  it("drops comparables whose link didn't come from the search, and duplicates", () => {
    const invented = { title: "Made up", url: "https://portal.example/listing/999", price_php: 1_000_000, floor_area_sqm: 40, location: "x" };
    const r = buildReport(condo, { comparables: [...six, invented, six[0]], adjustment_percent: 0, adjustment_reason: "" }, urls, [], ownUrl)!;
    expect(r.comparables).toHaveLength(6);
    expect(r.comparables.some((c) => c.title === "Made up")).toBe(false);
  });

  it("matches links without their query string, fragment, www or trailing slash", () => {
    expect(normalizeUrl("https://www.Portal.example/listing/1/?utm=x#photos")).toBe(normalizeUrl("https://portal.example/listing/1"));
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
  });

  it("ignores a price per square meter that is wildly off", () => {
    const typo = { title: "Typo", url: site(7), price_php: 400_000_000, floor_area_sqm: 40, location: "x" };
    const r = buildReport(condo, { comparables: [...six, typo], adjustment_percent: 0, adjustment_reason: "" }, [...urls, site(7)], [], ownUrl)!;
    expect(r.pricePerSqm!.count).toBe(6);
    expect(r.comparables).toHaveLength(7);
  });

  it("falls back to the AI's rough range when there are too few comparables, and says so", () => {
    const r = buildReport(condo, { comparables: six.slice(0, 2), adjustment_percent: 0, adjustment_reason: "", estimate_low_php: 5_000_000, estimate_high_php: 6_000_000 }, urls, [], ownUrl)!;
    expect(r.basis).toBe("estimate");
    expect(r.confidence).toBe("low");
    expect(r.pricePerSqm).toBeNull();
    expect(r.range).toEqual({ low: 500_000_000, high: 600_000_000 });
    expect(r.options.market).toBe(550_000_000);
  });

  it("says nothing when there is nothing to go on, or the rough range makes no sense", () => {
    expect(buildReport(condo, { comparables: [], adjustment_percent: 0, adjustment_reason: "" }, [], [], ownUrl)).toBeNull();
    expect(buildReport(condo, { comparables: [], estimate_low_php: 9_000_000, estimate_high_php: 1_000_000 }, [], [], ownUrl)).toBeNull();
    expect(buildReport(condo, "not an object", [], [], ownUrl)).toBeNull();
  });

  it("uses lot area for lots, and lists MyHomeSeller listings beside the web ones", () => {
    const lot = pricingInputSchema.parse({ location: "Pavia, Iloilo", type: "lot", lotArea: "200" });
    const lots = [8, 10, 12].map((k, i) => ({ title: `Lot ${i}`, url: site(20 + i), price_php: k * 1000 * 300, lot_area_sqm: 300, floor_area_sqm: 1, location: "Pavia" }));
    const r = buildReport(lot, { comparables: lots, adjustment_percent: 0, adjustment_reason: "" }, lots.map((l) => l.url), [{ id: "abc", name: "Corner lot", location: "Pavia", priceMinor: 180_000_000 }], ownUrl)!;
    expect(r.pricePerSqm!.median).toBe(1_000_000);
    expect(r.options.market).toBe(200_000_000);
    expect(r.confidence).toBe("fair");
    expect(r.comparables.at(-1)).toMatchObject({ source: "myhomeseller", url: "/l/abc", priceMinor: 180_000_000 });
  });
});

describe("towns and rural areas", () => {
  const house = pricingInputSchema.parse({ location: "Barangay Lanag, Pototan, Iloilo", type: "house_and_lot", floorArea: "90", lotArea: "200", condition: "good" });
  const page = "https://portal.example/houses-for-sale/pototan";

  it("keeps several listings from one result page, but not the same listing twice", () => {
    const onePage = [2, 2.4, 2.8, 3.2].map((m, i) => ({ title: `House ${i}`, url: page, price_php: m * 1_000_000, floor_area_sqm: 80 + i * 10, location: "Pototan" }));
    const r = buildReport(house, { comparables: [...onePage, onePage[0]], adjustment_percent: 0, adjustment_reason: "", compared_area: "Pototan, Iloilo" }, [page], [], ownUrl)!;
    expect(r.comparables).toHaveLength(4);
    expect(r.basis).toBe("comparables");
    expect(r.comparedArea).toBe("Pototan, Iloilo");
  });

  it("compares houses by lot area when the listings show only the lot", () => {
    // ₱8k, 10k and 12k per sqm of lot; the owner's lot is 200 sqm.
    const lotOnly = [8, 10, 12].map((k, i) => ({ title: `House ${i}`, url: site(40 + i), price_php: k * 1000 * 250, lot_area_sqm: 250, location: "Dingle" }));
    const r = buildReport(house, { comparables: lotOnly, adjustment_percent: 0, adjustment_reason: "" }, lotOnly.map((c) => c.url), [], ownUrl)!;
    expect(r.basis).toBe("comparables");
    expect(r.pricePerSqm).toMatchObject({ median: 1_000_000, of: "lot", count: 3 });
    expect(r.options.market).toBe(200_000_000);
  });

  it("uses the typical asking price when listings show a price but no area", () => {
    const noArea = [1.8, 2, 2.2, 2.4, 2.6].map((m, i) => ({ title: `House ${i}`, url: site(50 + i), price_php: m * 1_000_000, location: "Iloilo province" }));
    const r = buildReport(house, { comparables: noArea, adjustment_percent: 0, adjustment_reason: "", estimate_low_php: 9_000_000, estimate_high_php: 10_000_000 }, noArea.map((c) => c.url), [], ownUrl)!;
    expect(r.basis).toBe("prices");
    expect(r.pricePerSqm).toBeNull();
    expect(r.options.market).toBe(220_000_000);
    expect(r.range).toEqual({ low: 200_000_000, high: 240_000_000 });
    expect(r.confidence).toBe("fair");
  });

  it("falls back to the AI's range when the town has almost nothing online", () => {
    const one = [{ title: "House", url: site(60), price_php: 2_500_000, location: "Pototan" }];
    const r = buildReport(house, { comparables: one, adjustment_percent: 0, adjustment_reason: "", estimate_low_php: 2_000_000, estimate_high_php: 3_000_000, compared_area: "Nearby towns in Iloilo province" }, [site(60)], [], ownUrl)!;
    expect(r.basis).toBe("estimate");
    expect(r.confidence).toBe("low");
    expect(r.comparedArea).toBe("Nearby towns in Iloilo province");
  });

  it("tells the AI to widen to nearby towns and the province, and always to give a rough range", () => {
    const { system } = pricingPrompt(house, []);
    expect(system).toContain("nearby towns in the same province");
    expect(system).toContain("Always give estimate_low_php and estimate_high_php");
    expect(system).toContain("report each one separately");
  });
});

describe("the prompt", () => {
  it("describes the property, and names MyHomeSeller listings as context only", () => {
    const { system, user } = pricingPrompt(condo, [{ id: "1", name: "2BR unit", location: "Mandurriao", priceMinor: 480_000_000 }]);
    expect(system).toContain("Never invent a listing");
    expect(user).toContain("Floor area: 50 sqm");
    expect(user).toContain("2BR unit | Mandurriao | ₱4,800,000");
    expect(user).toContain("don't report them");
  });
});

describe("a research run", () => {
  const searchResult = (hits: string[]) => ({ type: "web_search_tool_result", tool_use_id: "s1", content: hits.map((url) => ({ type: "web_search_result", url, title: "t", encrypted_content: "x", page_age: null })) });
  const reportCall = (input: unknown) => ({ type: "tool_use", id: "t1", name: "report_comparables", input });

  it("only trusts links the search returned, across a paused turn", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ stop_reason: "pause_turn", content: [searchResult(urls.slice(0, 3))] })
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [searchResult(urls.slice(3)), reportCall({ comparables: [...six, { title: "Invented", url: site(99), price_php: 9_000_000, floor_area_sqm: 40, location: "x" }], adjustment_percent: 0, adjustment_reason: "" })],
      });
    const r = await researchPrice({ messages: { create } } as unknown as Anthropic, "m", condo, [], ownUrl);
    expect(create).toHaveBeenCalledTimes(2);
    expect(r!.comparables).toHaveLength(6);
    const firstCall = create.mock.calls[0]![0] as { tools: Array<{ name: string; max_uses?: number }> };
    expect(firstCall.tools.map((t) => t.name)).toEqual(["web_search", "report_comparables"]);
    expect(firstCall.tools[0]!.max_uses).toBe(7);
  });

  it("asks once for the report if the AI stops without it, then gives up", async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "Here is what I found." }] });
    expect(await researchPrice({ messages: { create } } as unknown as Anthropic, "m", condo, [], ownUrl)).toBeNull();
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("reusing a price check", () => {
  const base = { location: "Mandurriao, Iloilo City", type: "condominium" as const, floorArea: 32, condition: "good" as const };
  it("treats the same details as the same check, whatever the address's case or spacing", () => {
    expect(samePricingInput(base, { ...base, location: "  mandurriao ,iloilo  city " })).toBe(true);
  });
  it("treats any different detail as a new check", () => {
    expect(samePricingInput(base, { ...base, floorArea: 33 })).toBe(false);
    expect(samePricingInput(base, { ...base, bedrooms: 1 })).toBe(false);
    expect(samePricingInput(base, { ...base, condition: "new" as const })).toBe(false);
    expect(samePricingInput(base, { ...base, location: "Jaro, Iloilo City" })).toBe(false);
  });
});
