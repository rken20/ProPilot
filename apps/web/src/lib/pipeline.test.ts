import { describe, expect, it } from "vitest";
import { isQuiet, keeperProposals, keeperSummary, type KeeperProspect } from "./pipeline";

const NOW = new Date("2026-11-12T09:00:00+08:00");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const prospect = (o: Partial<KeeperProspect>): KeeperProspect => ({
  id: "p1",
  name: "Maria",
  stage: "inquiry",
  last_activity_at: daysAgo(0),
  next_step: null,
  next_step_at: null,
  ...o,
});

describe("isQuiet", () => {
  it("counts only open stages past the follow-up days", () => {
    expect(isQuiet(prospect({ last_activity_at: daysAgo(3) }), 3, NOW)).toBe(true);
    expect(isQuiet(prospect({ last_activity_at: daysAgo(2) }), 3, NOW)).toBe(false);
    expect(isQuiet(prospect({ stage: "won", last_activity_at: daysAgo(30) }), 3, NOW)).toBe(false);
  });
});

describe("keeperProposals", () => {
  const base = { prospects: [], newRequests: [], recent: [], followUpDays: 3, now: NOW };

  it("flags requests left New for a day, quiet leads and due next steps", () => {
    const out = keeperProposals({
      ...base,
      newRequests: [
        { id: "r1", buyer_name: "Jun", property_name: "Pasig condo", created_at: daysAgo(2), prospect_id: "pj" },
        { id: "r2", buyer_name: "Lia", property_name: null, created_at: daysAgo(0.5), prospect_id: "pl" },
      ],
      prospects: [
        prospect({ id: "pj", last_activity_at: daysAgo(9) }), // already flagged by its request
        prospect({ id: "p2", name: "Ana", stage: "viewing", last_activity_at: daysAgo(4) }),
        prospect({ id: "p3", name: "Ben", next_step: "Send reservation form", next_step_at: daysAgo(0.1), last_activity_at: daysAgo(10) }),
        prospect({ id: "p4", stage: "lost", last_activity_at: daysAgo(40) }),
      ],
    });
    expect(out.map((p) => [p.dedupe_key, p.title])).toEqual([
      ["request:r1", "Reply to Jun's viewing request"],
      ["quiet:p2", "Check in with Ana"],
      [`next:p3:${daysAgo(0.1).slice(0, 10)}`, "Send reservation form (Ben)"],
    ]);
    expect(out[0]!.reason).toBe("Asked to view Pasig condo 2 days ago and it's still marked New.");
    expect(out[1]!.reason).toBe("No messages or updates for 4 days. Stage: Viewing.");
    expect(keeperSummary(out)).toBe("Found 1 unanswered viewing request, 1 next step due, 1 quiet lead.");
  });

  it("doesn't repeat an open proposal or one closed within the follow-up period", () => {
    const quiet = [prospect({ id: "a", last_activity_at: daysAgo(5) }), prospect({ id: "b", last_activity_at: daysAgo(5) }), prospect({ id: "c", last_activity_at: daysAgo(5) })];
    const out = keeperProposals({
      ...base,
      prospects: quiet,
      recent: [
        { dedupe_key: "quiet:a", status: "proposed", decided_at: null, created_at: daysAgo(1) },
        { dedupe_key: "quiet:b", status: "dismissed", decided_at: daysAgo(1), created_at: daysAgo(2) },
        { dedupe_key: "quiet:c", status: "done", decided_at: daysAgo(4), created_at: daysAgo(5) },
      ],
    });
    expect(out.map((p) => p.dedupe_key)).toEqual(["quiet:c"]);
  });

  it("says when there's nothing to do", () => {
    expect(keeperSummary(keeperProposals(base))).toMatch(/on track/);
  });
});
