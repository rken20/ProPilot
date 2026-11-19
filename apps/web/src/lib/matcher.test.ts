import { describe, expect, it } from "vitest";
import { matchDraft, matcherProposals, matchKey, type MatcherLead, type MatcherListing } from "./matcher";

const now = new Date("2026-11-19T22:00:00Z");
const lead = (over: Partial<MatcherLead> = {}): MatcherLead => ({
  id: "lead-1",
  name: "Juan dela Cruz",
  property_id: null,
  budget_min_minor: null,
  budget_max_minor: 900_000_000,
  areas: ["Pasig"],
  property_types: ["house_and_lot"],
  timeline: null,
  financing: null,
  ...over,
});
const house: MatcherListing = { id: "l-house", name: "3BR House", type: "house_and_lot", location: "Pasig", price_minor: 800_000_000, financing: null };
const condo: MatcherListing = { ...house, id: "l-condo", name: "Studio", type: "condominium" };

describe("matcherProposals", () => {
  it("suggests a message when the lead has an app chat", () => {
    const [p, ...rest] = matcherProposals({
      leads: [lead()],
      listings: [condo, house],
      chats: [{ id: "c1", prospect_id: "lead-1", channel: "app", last_inbound_at: null, last_message_at: "2026-11-01T00:00:00Z" }],
      suggested: new Set(),
      now,
    });
    expect(rest).toEqual([]);
    expect(p).toMatchObject({ kind: "message", conversation_id: "c1", title: "Send 3BR House to Juan dela Cruz", dedupe_key: matchKey("lead-1", "l-house") });
    expect(p!.draft).toContain("Hi Juan!");
  });

  it("falls back to a reminder when Messenger's reply window has closed", () => {
    const [p] = matcherProposals({
      leads: [lead()],
      listings: [house],
      chats: [{ id: "c1", prospect_id: "lead-1", channel: "messenger", last_inbound_at: "2026-11-17T00:00:00Z", last_message_at: "2026-11-17T00:00:00Z" }],
      suggested: new Set(),
      now,
    });
    expect(p).toMatchObject({ kind: "reminder", conversation_id: null, draft: null, title: "Tell Juan dela Cruz about 3BR House" });
  });

  it("skips listings already suggested, the one they asked about, and weak matches", () => {
    const base = { listings: [house], chats: [], now };
    expect(matcherProposals({ ...base, leads: [lead()], suggested: new Set([matchKey("lead-1", "l-house")]) })).toEqual([]);
    expect(matcherProposals({ ...base, leads: [lead({ property_id: "l-house" })], suggested: new Set() })).toEqual([]);
    // Type and budget only, area unknown: 25 + 35 + 10 + 5 = 75 still suggests; an over-budget one doesn't.
    expect(matcherProposals({ ...base, leads: [lead({ areas: [] })], suggested: new Set() })).toHaveLength(1);
    expect(matcherProposals({ ...base, leads: [lead({ areas: [], budget_max_minor: 750_000_000 })], suggested: new Set() })).toEqual([]);
  });
});

describe("matchDraft", () => {
  it("reads naturally without a name", () => {
    expect(matchDraft(null, house, { score: 90, fits: ["House and lot", "Within budget (up to ₱9,000,000)", "In Pasig"], gaps: [] })).toBe(
      "Hi! We have a listing that fits what you're looking for: 3BR House in Pasig, ₱8,000,000. House and lot, in Pasig. Would you like photos or to schedule a viewing?",
    );
  });
});
