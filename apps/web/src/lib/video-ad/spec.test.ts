import { describe, expect, it } from "vitest";
import { FPS, MAX_LINES, amountsIn, buildTimeline, cleanPlan, cleanText, defaultText, phrasesFrom, pickTemplate, scenesAt, shortPlace, statesOtherAmount, TEMPLATE_IDS, type AdListing } from "./spec";

const house: AdListing = {
  name: "3BR House, Lanag",
  typeLabel: "House and lot",
  location: "Barangay Lanag, Pototan, Iloilo",
  price: "₱2,500,000",
  priceMinor: 250_000_000,
  status: "available",
  reservationFee: "₱20,000",
  downpaymentPercent: 20,
  financing: ["Bank financing", "Pag-IBIG"],
  description: "3 bedrooms, 2 bathrooms. Covered garage; fenced garden\nTen minutes from the town plaza. Clean title, ready for occupancy and the owner will include all the built-in cabinets and appliances.",
  business: "Santos Realty",
};

describe("the timeline", () => {
  it("opens on the cover, shows each other photo once, and closes on the cover", () => {
    const t = buildTimeline("showcase", 5, ["A", "B"]);
    expect(t.scenes.map((s) => s.kind)).toEqual(["intro", "photo", "photo", "photo", "photo", "outro"]);
    expect(t.scenes.map((s) => s.photo)).toEqual([0, 1, 2, 3, 4, 0]);
    expect(t.scenes.filter((s) => s.kind === "photo").map((s) => s.line)).toEqual(["A", "B", null, null]);
  });

  it("repeats photos when there are more feature lines than photos", () => {
    const t = buildTimeline("facts", 2, ["A", "B", "C", "D"]);
    const photoScenes = t.scenes.filter((s) => s.kind === "photo");
    expect(photoScenes).toHaveLength(4);
    expect(photoScenes.map((s) => s.photo)).toEqual([1, 0, 1, 0]);
    expect(buildTimeline("showcase", 1, []).scenes.every((s) => s.photo === 0)).toBe(true);
  });

  it("overlaps neighbouring scenes by the fade, with no gap", () => {
    for (const id of TEMPLATE_IDS) {
      const t = buildTimeline(id, 6, ["A", "B", "C"]);
      for (let i = 1; i < t.scenes.length; i++) expect(t.scenes[i]!.start).toBeCloseTo(t.scenes[i - 1]!.end - t.fade, 6);
      expect(t.frames).toBe(Math.round(t.duration * FPS));
      // Every moment of the video has something on screen.
      for (let f = 0; f < t.frames; f += 7) expect(scenesAt(t, f / FPS).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("stays a short ad however many photos and lines it's given", () => {
    for (const id of TEMPLATE_IDS) {
      expect(buildTimeline(id, 40, Array(20).fill("x")).duration).toBeLessThanOrEqual(31);
      expect(buildTimeline(id, 1, []).duration).toBeGreaterThanOrEqual(6);
    }
  });
});

describe("the words, straight from the listing", () => {
  it("uses the last two parts of the address for the headline", () => {
    expect(shortPlace("Barangay Lanag, Pototan, Iloilo")).toBe("Pototan, Iloilo");
    expect(shortPlace("Makati")).toBe("Makati");
  });

  it("takes short phrases from the description and skips long sentences whole", () => {
    expect(phrasesFrom(house.description)).toEqual(["3 bedrooms", "2 bathrooms", "Covered garage", "fenced garden", "Ten minutes from the town plaza"]);
  });

  it("builds a default ad with no AI", () => {
    const text = defaultText(house);
    expect(text.hook).toBe("House and lot for sale in Pototan, Iloilo");
    expect(text.lines).toEqual(["3 bedrooms", "2 bathrooms", "Covered garage", "Bank financing, Pag-IBIG accepted", "Reservation fee ₱20,000", "20% downpayment"]);
    expect(text.lines.length).toBeLessThanOrEqual(MAX_LINES);
    expect(defaultText(house, "taglish").cta).toContain("para mag-schedule");
    expect(defaultText({ ...house, status: "reserved" }).hook).toBe("House and lot in Pototan, Iloilo");
  });

  it("picks a template by simple rules", () => {
    expect(pickTemplate(house, 2)).toBe("facts");
    expect(pickTemplate(house, 6)).toBe("bold");
    expect(pickTemplate({ ...house, priceMinor: 650_000_000 }, 6)).toBe("showcase");
    expect(pickTemplate({ ...house, priceMinor: 2_500_000_000 }, 6)).toBe("elegant");
    expect(pickTemplate({ priceMinor: 900_000_000, typeLabel: "Lot only" }, 6)).toBe("bold");
  });
});

describe("amounts the listing doesn't state", () => {
  it("reads peso amounts however they're written", () => {
    expect(amountsIn("₱2,500,000")).toEqual([2_500_000]);
    expect(amountsIn("only 2.5M, RF P20k")).toEqual([2_500_000, 20_000]);
    expect(amountsIn("PHP 4.8 million")).toEqual([4_800_000]);
    expect(amountsIn("3 bedrooms, 120 sqm, 10 minutes away")).toEqual([]);
  });

  it("flags a different price, and lets the listing's own amounts through", () => {
    expect(statesOtherAmount("Now only ₱2.3M!", house)).toBe(true);
    expect(statesOtherAmount("Yours for ₱2.5M, reserve for ₱20,000", house)).toBe(false);
    expect(statesOtherAmount("3 bedrooms near the plaza", house)).toBe(false);
  });
});

describe("what the AI proposes", () => {
  it("is kept when it's sound", () => {
    const plan = cleanPlan({ template: "elegant", reason: "Six bright photos.", hook: "  Your family home in Pototan ", lines: ["3 bedrooms", "Covered garage", "3 BEDROOMS"], cta: "Message us today" }, house, 6);
    expect(plan).toEqual({ template: "elegant", reason: "Six bright photos.", text: { hook: "Your family home in Pototan", lines: ["3 bedrooms", "Covered garage"], cta: "Message us today" } });
  });

  it("falls back part by part: unknown template, invented price, empty text", () => {
    const plan = cleanPlan({ template: "fireworks", hook: "Now only ₱1.9M!", lines: ["Was ₱3M", "Covered garage"], cta: "" }, house, 6);
    expect(plan.template).toBe("bold");
    expect(plan.text.hook).toBe("House and lot for sale in Pototan, Iloilo");
    expect(plan.text.lines).toEqual(["Covered garage"]);
    expect(plan.text.cta).toBe("Message us to schedule a viewing");
    expect(cleanPlan("nonsense", house, 1).template).toBe("facts");
    expect(cleanPlan(null, house, 6).text).toEqual(defaultText(house));
  });

  it("cuts text to what fits on screen", () => {
    const long = "x".repeat(200);
    const plan = cleanPlan({ template: "showcase", hook: long, lines: Array(10).fill(0).map((_, i) => `Feature number ${i}`), cta: long }, house, 6);
    expect(plan.text.hook.length).toBeLessThanOrEqual(60);
    expect(plan.text.cta.length).toBeLessThanOrEqual(44);
    expect(plan.text.lines).toHaveLength(MAX_LINES);
    expect(cleanText({ hook: "  Hi  there ", lines: ["", " a  b "], cta: "Go" })).toEqual({ hook: "Hi there", lines: ["a b"], cta: "Go" });
  });
});
