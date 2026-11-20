import { describe, expect, it } from "vitest";
import { CONSENT_TEXT, lookingForNote, parseWants, pickMatches, planRank, withNote, type Alert, type AlertListing } from "./match-alert-rules";

const raw = { types: ["house_and_lot"], budget: "5,000,000", areas: "Pavia, Santa Barbara", timeline: "1_3_months", financing: "pagibig", consent: true, email: "ana@example.test" };

describe("what the buyer is looking for", () => {
  it("is read from the form", () => {
    const r = parseWants(raw);
    expect(r).toEqual({ wants: { types: ["house_and_lot"], budgetMaxMinor: 500_000_000, areas: ["Pavia", "Santa Barbara"], timeline: "1_3_months", financing: "pagibig", consent: true } });
  });

  it("is all optional without the tick box", () => {
    expect(parseWants({ types: [], budget: "", areas: "", timeline: "", financing: "", consent: false, email: "" })).toEqual({
      wants: { types: [], budgetMaxMinor: null, areas: [], timeline: null, financing: null, consent: false },
    });
  });

  it("needs an email and at least two of type, budget and area to get match emails", () => {
    expect(parseWants({ ...raw, email: "" })).toEqual({ fieldErrors: { buyerEmail: expect.stringContaining("email") } });
    expect(parseWants({ ...raw, budget: "", areas: "" })).toEqual({ fieldErrors: { alertConsent: expect.stringContaining("at least two") } });
    expect("wants" in parseWants({ ...raw, types: [] })).toBe(true);
  });

  it("rejects amounts and area lists that make no sense, and ignores unknown choices", () => {
    expect(parseWants({ ...raw, budget: "five million" })).toMatchObject({ fieldErrors: { wantBudget: expect.any(String) } });
    expect(parseWants({ ...raw, areas: "a1, b2, c3, d4, e5, f6" })).toMatchObject({ fieldErrors: { wantAreas: expect.any(String) } });
    const r = parseWants({ ...raw, types: ["castle", "lot", "lot"], timeline: "someday", financing: "barter" });
    expect(r).toMatchObject({ wants: { types: ["lot"], timeline: null, financing: null } });
  });

  it("becomes one line for the seller, kept inside the message limit", () => {
    const { wants } = parseWants(raw) as { wants: Parameters<typeof lookingForNote>[0] };
    const note = lookingForNote(wants);
    expect(note).toBe("Looking for: House and lot; up to ₱5,000,000; in Pavia, Santa Barbara; buying: in 1 to 3 months; paying by: pag-ibig.");
    expect(withNote(undefined, note)).toBe(note);
    expect(withNote("Is it available?", note)).toBe(`Is it available?\n\n${note}`);
    expect(withNote("x".repeat(1000), note)!.length).toBeLessThanOrEqual(1000);
    expect(withNote("Hello", "")).toBe("Hello");
  });

  it("the consent wording says who emails, what, and how to stop", () => {
    expect(CONSENT_TEXT).toContain("other sellers");
    expect(CONSENT_TEXT).toContain("stop anytime");
  });
});

describe("which listings a buyer is emailed", () => {
  const alert: Alert = { id: "a", budgetMaxMinor: 500_000_000, areas: ["Pavia"], types: ["house_and_lot"], financing: null, sourceBusinessId: "free", sourcePropertyId: "asked" };
  const house = (id: string, business_id: string, price = 450_000_000, location = "Pavia, Iloilo", type = "house_and_lot"): AlertListing => ({ id, business_id, name: id, type, location, price_minor: price, financing: null });
  const plans: Record<string, string> = { agencyBiz: "agency", proBiz: "pro", basicBiz: "basic" };
  const planOf = (b: string) => plans[b];

  it("puts paid sellers first: Agency, Pro, Basic, then Free", () => {
    const picked = pickMatches(alert, [house("f", "free"), house("b", "basicBiz"), house("g", "agencyBiz"), house("p", "proBiz")], new Set(), planOf);
    expect(picked.map((l) => l.id)).toEqual(["g", "p", "b", "f"]);
    expect([planRank("agency"), planRank("pro"), planRank("basic"), planRank("free"), planRank(undefined)]).toEqual([3, 2, 1, 0, 0]);
  });

  it("only sends listings that fit: right type, right area, never over the budget", () => {
    const picked = pickMatches(
      alert,
      [house("ok", "free"), house("dear", "agencyBiz", 520_000_000), house("far", "agencyBiz", 400_000_000, "Makati"), house("condo", "agencyBiz", 400_000_000, "Pavia", "condominium")],
      new Set(),
      planOf,
    );
    expect(picked.map((l) => l.id)).toEqual(["ok"]);
  });

  it("never repeats a listing, or the one the buyer already asked about", () => {
    const picked = pickMatches(alert, [house("asked", "agencyBiz"), house("sent", "agencyBiz"), house("new", "free")], new Set(["sent"]), planOf);
    expect(picked.map((l) => l.id)).toEqual(["new"]);
  });

  it("sends at most five", () => {
    const many = Array.from({ length: 9 }, (_, i) => house(`h${i}`, "free"));
    expect(pickMatches(alert, many, new Set(), planOf)).toHaveLength(5);
  });
});
