import { describe, expect, it } from "vitest";
import {
  afterHours,
  buckets,
  fmtDuration,
  leadsReport,
  listingReport,
  manilaDayStart,
  median,
  messengerReport,
  parseRange,
  teamReport,
  type ConversationRow,
  type MessageRow,
  type PropertyRow,
  type ViewingRow,
} from "./reports";

const NOW = new Date("2026-11-11T09:00:00+08:00");

describe("ranges", () => {
  it("defaults to the last 30 Manila days, ending tonight", () => {
    const r = parseRange({}, NOW);
    expect(r.days).toBe(30);
    expect(r.to.toISOString()).toBe("2026-11-11T16:00:00.000Z"); // midnight Nov 12, Manila
    expect(r.from.toISOString()).toBe("2026-10-12T16:00:00.000Z");
  });

  it("handles this month, last month and January", () => {
    expect(parseRange({ range: "month" }, NOW).from.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    const last = parseRange({ range: "last-month" }, NOW);
    expect([last.from.toISOString(), last.to.toISOString(), last.days]).toEqual(["2026-09-30T16:00:00.000Z", "2026-10-31T16:00:00.000Z", 31]);
    expect(parseRange({ range: "last-month" }, new Date("2027-01-05T10:00:00+08:00")).from.toISOString()).toBe("2026-11-30T16:00:00.000Z");
  });

  it("accepts a custom range, swaps reversed dates and ignores junk", () => {
    const r = parseRange({ from: "2026-11-05", to: "2026-11-01" }, NOW);
    expect(r.days).toBe(5);
    expect(parseRange({ range: "drop table" }, NOW).key).toBe("range=30");
    expect(parseRange({ from: "2026-13-40", to: "x" }, NOW).key).toBe("range=30");
  });

  it("uses days up to a month and weeks beyond", () => {
    expect(buckets(parseRange({ range: "7" }, NOW))).toHaveLength(7);
    const weeks = buckets(parseRange({ range: "90" }, NOW));
    expect(weeks.length).toBeGreaterThanOrEqual(13);
    expect(weeks[0]!.label).toMatch(/^Wk of/);
  });

  it("finds Manila midnight", () => {
    expect(manilaDayStart(new Date("2026-11-11T23:30:00+08:00")).toISOString()).toBe("2026-11-10T16:00:00.000Z");
  });
});

describe("helpers", () => {
  it("medians and durations", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(fmtDuration(30_000)).toBe("30 sec");
    expect(fmtDuration(12 * 60_000)).toBe("12 min");
    expect(fmtDuration(3.5 * 3600_000)).toBe("3.5 hr");
    expect(fmtDuration(3 * 86_400_000)).toBe("3 days");
    expect(fmtDuration(null)).toBe("—");
  });

  it("knows office hours in Manila", () => {
    expect(afterHours("2026-11-11T10:00:00+08:00")).toBe(false); // Wednesday 10 am
    expect(afterHours("2026-11-11T21:00:00+08:00")).toBe(true); // 9 pm
    expect(afterHours("2026-11-15T10:00:00+08:00")).toBe(true); // Sunday
  });
});

const vr = (o: Partial<ViewingRow>): ViewingRow => ({
  id: Math.random().toString(36),
  property_id: "p1",
  status: "new",
  created_at: "2026-11-10T10:00:00+08:00",
  first_response_at: null,
  responded_by: null,
  closed_at: null,
  ...o,
});
const conv = (o: Partial<ConversationRow>): ConversationRow => ({
  id: Math.random().toString(36),
  created_at: "2026-11-10T21:00:00+08:00",
  mode: "ai",
  taken_over_by: null,
  lead_status: "none",
  property_id: null,
  ...o,
});

describe("leadsReport", () => {
  it("adds up both sources, the stages and the conversion", () => {
    const r = leadsReport(
      [
        vr({ status: "scheduled", first_response_at: "2026-11-10T10:20:00+08:00" }),
        vr({ status: "new" }),
        vr({ status: "closed", first_response_at: "2026-11-10T11:00:00+08:00" }),
      ],
      [conv({ lead_status: "scheduled" }), conv({})],
      parseRange({ range: "7" }, NOW),
    );
    expect(r).toMatchObject({ inquiries: 5, fromProPilot: 3, fromMessenger: 2, viewingRequests: 4, reachedViewing: 2, closed: 1, conversion: 50 });
    expect(r.medianFirstResponseMs).toBe(40 * 60_000);
    expect(r.series.find((b) => b.propilot)).toMatchObject({ propilot: 3, messenger: 2 });
    expect(r.stages.map((s) => s.value)).toEqual([1, 0, 2, 0, 1]);
  });
});

const prop = (o: Partial<PropertyRow>): PropertyRow => ({
  id: "p1",
  name: "Condo",
  location: "Pasig",
  status: "available",
  price_minor: 100,
  created_at: "2026-10-01T00:00:00+08:00",
  sold_at: null,
  assigned_agent_id: null,
  ...o,
});

describe("listingReport", () => {
  it("counts activity per listing and days on the market", () => {
    const rows = listingReport(
      [prop({}), prop({ id: "p2", name: "Lot", status: "sold", sold_at: "2026-10-11T00:00:00+08:00" }), prop({ id: "p3", name: "Old", status: "archived" })],
      [vr({}), vr({ property_id: "p2" })],
      [conv({ lead_status: "new", property_id: "p1" })],
      [{ property_id: "p1", created_at: "" }],
      [{ property_id: "p1", created_at: "" }, { property_id: "p1", created_at: "" }],
      [{ property_id: "p2", created_at: "" }],
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(["p1", "p2"]); // quiet archived listing left out
    expect(rows[0]).toMatchObject({ saves: 1, questions: 2, viewingRequests: 2, facebookPosts: 0, daysOnMarket: 41 });
    expect(rows[1]).toMatchObject({ viewingRequests: 1, facebookPosts: 1, daysOnMarket: 10 });
  });
});

describe("messengerReport", () => {
  it("separates AI-only chats from handovers and times the replies", () => {
    const a = conv({ id: "a" });
    const b = conv({ id: "b", mode: "human", lead_status: "new" });
    const msgs: MessageRow[] = [
      { conversation_id: "a", sender: "buyer", sent_by: null, created_at: "2026-11-10T21:00:00+08:00" },
      { conversation_id: "a", sender: "buyer", sent_by: null, created_at: "2026-11-10T21:00:02+08:00" },
      { conversation_id: "a", sender: "ai", sent_by: null, created_at: "2026-11-10T21:00:06+08:00" },
      { conversation_id: "b", sender: "buyer", sent_by: null, created_at: "2026-11-10T10:00:00+08:00" },
      { conversation_id: "b", sender: "ai", sent_by: null, created_at: "2026-11-10T10:00:04+08:00" },
      { conversation_id: "b", sender: "buyer", sent_by: null, created_at: "2026-11-10T10:05:00+08:00" },
      { conversation_id: "b", sender: "agent", sent_by: "u1", created_at: "2026-11-10T10:15:00+08:00" },
    ];
    expect(messengerReport([a, b], msgs)).toEqual({
      conversations: 2,
      aiOnly: 1,
      handedOver: 1,
      aiReplies: 2,
      afterHoursAnswered: 1,
      viewingRequests: 1,
      medianAiReplyMs: 5000,
      medianTeamReplyMs: 10 * 60_000,
    });
  });
});

describe("teamReport", () => {
  it("credits responses, viewings and Messenger work to each person", () => {
    const rows = teamReport(
      [
        { user_id: "u1", role: "agent", name: "Ana" },
        { user_id: "u2", role: "owner", name: "Ken" },
      ],
      [prop({ assigned_agent_id: "u1" })],
      [
        vr({ responded_by: "u1", status: "scheduled", first_response_at: "2026-11-10T10:30:00+08:00" }),
        vr({ responded_by: "u2", status: "closed", first_response_at: "2026-11-10T12:00:00+08:00" }),
      ],
      [conv({ taken_over_by: "u1" })],
      [{ conversation_id: "x", sender: "agent", sent_by: "u1", created_at: "" }],
    );
    expect(rows[0]).toMatchObject({ name: "Ana", listings: 1, leadsOnListings: 2, responded: 1, viewings: 1, closed: 0, chatsTakenOver: 1, messengerReplies: 1 });
    expect(rows[0]!.medianResponseMs).toBe(30 * 60_000);
    expect(rows[1]).toMatchObject({ name: "Ken", responded: 1, closed: 1 });
  });
});
