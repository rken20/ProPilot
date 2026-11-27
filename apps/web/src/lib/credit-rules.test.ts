import { describe, expect, it } from "vitest";
import { CREDIT_COST, creditsNeeded, packBuys, paymentItem, perThousand } from "./credit-rules";

describe("AI credits", () => {
  it("are needed only once the month's allowance is used up", () => {
    expect(creditsNeeded("reply", 5_999, 6_000)).toBe(0);
    expect(creditsNeeded("reply", 6_000, 6_000)).toBe(1);
    expect(creditsNeeded("ask", 399, 400)).toBe(0);
    expect(creditsNeeded("ask", 400, 400)).toBe(2);
    expect(creditsNeeded("ask", 9_999, null)).toBe(0);
    // A plan without the feature (limit 0) needs credits from the first use.
    expect(creditsNeeded("ask", 0, 0)).toBe(CREDIT_COST.ask);
  });

  it("say what a pack buys and compare packs per 1,000", () => {
    expect(packBuys(1_000)).toBe("1,000 AI replies, or 500 Ask MyHomeSeller questions");
    expect(perThousand({ credits: 1_000, priceMinor: 14_900 })).toBe(14_900);
    expect(perThousand({ credits: 3_000, priceMinor: 39_900 })).toBe(13_300);
    expect(perThousand({ credits: 10_000, priceMinor: 119_900 })).toBe(11_990);
  });

  it("name what a payment bought", () => {
    expect(paymentItem({ months: 3, plans: { name: "Pro" } })).toBe("Pro, 3 months");
    expect(paymentItem({ months: 1, plans: { name: "Pro" } }, true)).toBe("Pro, 1 mo");
    expect(paymentItem({ months: 1, plans: null, credit_packs: { credits: 3_000 } })).toBe("3,000 AI credits");
  });
});
