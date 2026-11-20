import { describe, expect, it } from "vitest";
import { crossed, nextPlan, usageItems, usageLevel, usageSentence } from "./usage-rules";

const pro = { ai: true, aiReplies: 10_000, homeFinderBuyers: 20, priceChecks: 0 };

describe("allowance levels", () => {
  it("is low from 80% and out at the limit", () => {
    expect(usageLevel(7_999, 10_000)).toBe("ok");
    expect(usageLevel(8_000, 10_000)).toBe("low");
    expect(usageLevel(9_999, 10_000)).toBe("low");
    expect(usageLevel(10_000, 10_000)).toBe("out");
    // Small allowances: 4 of 5 is low, 3 of 5 isn't.
    expect(usageLevel(3, 5)).toBe("ok");
    expect(usageLevel(4, 5)).toBe("low");
  });

  it("covers only what the plan includes with a limit", () => {
    const items = usageItems(pro, { replies: 8_400, finder: 20, priceChecks: 0 });
    expect(items).toEqual([
      { key: "replies", used: 8_400, limit: 10_000, level: "low" },
      { key: "finder", used: 20, limit: 20, level: "out" },
    ]);
    expect(usageItems({ ...pro, aiReplies: null }, { replies: 99_999, finder: 1, priceChecks: 0 })).toEqual([{ key: "finder", used: 1, limit: 20, level: "ok" }]);
    expect(usageItems({ ai: false, aiReplies: 0, homeFinderBuyers: 0, priceChecks: 0 }, { replies: 0, finder: 0, priceChecks: 0 })).toEqual([]);
  });

  it("says what is low and what stops when it's used up", () => {
    expect(usageSentence({ key: "replies", used: 8_400, limit: 10_000, level: "low" })).toBe("AI replies: 8,400 of 10,000 replies used this month, 1,600 left.");
    expect(usageSentence({ key: "priceChecks", used: 20, limit: 20, level: "out" })).toContain("all 20 price checks for this month are used");
  });

  it("suggests the next plan up, and nothing on Agency", () => {
    expect(nextPlan("basic")?.name).toBe("Pro");
    expect(nextPlan("pro")?.name).toBe("Agency");
    expect(nextPlan("agency")).toBeNull();
  });
});

describe("the once-only email", () => {
  it("fires when a level is first reached, not again while it stays there", () => {
    expect(crossed(7_000, 8_100, 10_000)).toBe("low");
    expect(crossed(8_100, 9_000, 10_000)).toBeNull();
    expect(crossed(9_000, 10_000, 10_000)).toBe("out");
    expect(crossed(10_000, 10_000, 10_000)).toBeNull();
    // Straight from fine to used up in one day: one email, about being out.
    expect(crossed(100, 10_000, 10_000)).toBe("out");
    expect(crossed(100, 200, 10_000)).toBeNull();
  });
});
