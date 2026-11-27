import { describe, expect, it } from "vitest";
import {
  afterNumbers,
  boosted,
  countAfterPosts,
  interactions,
  median,
  paidViews,
  recommendations,
  totals,
  verdicts,
  type AnalystInput,
  type PostRow,
} from "./post-analyst";

const NOW = new Date("2026-11-27T04:00:00Z");
const daysAgo = (d: number) =>
  new Date(NOW.getTime() - d * 86_400_000).toISOString();
const house = { id: "L1", name: "Sample House", isPublic: true, forSale: true };
const lot = { id: "L2", name: "Sample Lot", isPublic: true, forSale: true };

let seq = 0;
function post(
  over: Partial<PostRow> & { got?: number; age?: number; leads?: number } = {},
): PostRow {
  const { got = 0, age = 5, leads = 0, ...rest } = over;
  return {
    id: `p${++seq}`,
    kind: "photos",
    pageName: "Sample Realty",
    postedAt: daysAgo(age),
    permalink: "https://www.facebook.com/1/posts/2",
    listing: house,
    fb: { reactions: got, comments: 0, shares: 0 },
    views: null,
    adViews: null,
    clicks: null,
    video: null,
    after: {
      days: Math.min(7, age + 1),
      views: 0,
      viewsBefore: 0,
      inquiries: leads,
      chats: 0,
    },
    ...rest,
  };
}
const input = (
  posts: PostRow[],
  over: Partial<AnalystInput> = {},
): AnalystInput => ({
  posts,
  connected: true,
  listings: [{ id: "L1", name: "Sample House", isPublic: true, views30: 40 }],
  videoAds: true,
  now: NOW,
  ...over,
});
const keys = (i: AnalystInput) =>
  recommendations(i).map((r) => r.key.split(":")[0]);

describe("the numbers on a post", () => {
  it("add up reactions, comments and shares, or stay missing", () => {
    expect(
      interactions(post({ fb: { reactions: 4, comments: 2, shares: 1 } })),
    ).toBe(7);
    expect(interactions(post({ fb: null }))).toBeNull();
  });

  it("call a post boosted only when Facebook reports views or plays from ads", () => {
    expect(boosted(post())).toBe(false);
    expect(boosted(post({ adViews: 0 }))).toBe(false);
    expect(boosted(post({ adViews: 12 }))).toBe(true);
    const video = post({
      kind: "video",
      video: {
        plays: 90,
        paidPlays: 60,
        avgWatchMs: null,
        lengthMs: null,
        completes: null,
      },
    });
    expect([boosted(video), paidViews(video)]).toEqual([true, 60]);
  });

  it("take the middle value", () => {
    expect(median([])).toBe(0);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });
});

describe("verdicts", () => {
  it("need three posts old enough to compare", () => {
    expect(verdicts([post({ got: 50 }), post({ got: 1 })], NOW).size).toBe(0);
  });

  it("compare each post with the business's own usual", () => {
    const strong = post({ got: 30 });
    const withLead = post({ got: 6, leads: 1 });
    const middle = post({ got: 6 });
    const weak = post({ got: 1 });
    const fresh = post({ got: 0, age: 1 });
    const unread = post({ fb: null });
    const v = verdicts([strong, withLead, middle, weak, fresh, unread], NOW);
    expect(
      [strong, withLead, middle, weak, fresh].map((p) => v.get(p.id)),
    ).toEqual(["working", "working", "average", "quiet", "new"]);
    expect(v.has(unread.id)).toBe(false);
  });

  it("don't call a post that brought an inquiry quiet", () => {
    const v = verdicts(
      [post({ got: 20 }), post({ got: 20 }), post({ got: 0, leads: 1 })],
      NOW,
    );
    expect([...v.values()]).toEqual(["average", "average", "average"]);
  });
});

describe("totals", () => {
  it("add up what Facebook gave", () => {
    const a = post({ got: 3, views: 100, adViews: 40 });
    const b = post({ got: 4 });
    const c = post({ fb: null });
    expect(totals([a, b, c])).toEqual({
      posts: 3,
      read: 2,
      interactions: 7,
      views: 100,
      boosted: 1,
      adViews: 40,
    });
  });

  it("count an inquiry once when two posts' weeks overlap", () => {
    const posts = ["2026-11-10T00:00:00Z", "2026-11-13T00:00:00Z"];
    const events = [
      "2026-11-09T00:00:00Z",
      "2026-11-14T00:00:00Z",
      "2026-11-19T00:00:00Z",
      "2026-11-21T00:00:00Z",
    ];
    expect(countAfterPosts(posts, events, NOW)).toBe(2);
    expect(countAfterPosts([], events, NOW)).toBe(0);
  });

  it("leave views missing when Facebook gave none", () => {
    expect(totals([post()]).views).toBeNull();
  });
});

describe("recommendations", () => {
  it("start with connecting a Page, then with a first post", () => {
    expect(keys(input([], { connected: false }))).toEqual(["connect"]);
    const first = recommendations(input([]));
    expect(first.map((r) => r.key)).toEqual(["first-post"]);
    expect(first[0]!.body[0]).toContain("40 views");
    expect(recommendations(input([], { listings: [] }))).toEqual([]);
  });

  it("tell a boost that brings inquiries from one that doesn't, with the numbers", () => {
    const good = post({ adViews: 900, leads: 2 });
    const bad = post({ adViews: 900, leads: 0, listing: lot });
    const early = post({ adViews: 900, leads: 0, age: 1 });
    const recs = recommendations(input([good, bad, early]));
    const working = recs.find((r) => r.key === `boost-working:${good.id}`)!;
    expect(working.body[0]).toContain("900 views from ads");
    expect(working.body[0]).toContain("divide it by 2");
    expect(
      recs.find((r) => r.key === `boost-no-leads:${bad.id}`)!.body[0],
    ).toContain("Pause the boost");
    // Too soon to judge a boost that started yesterday.
    expect(recs.some((r) => r.key.endsWith(early.id))).toBe(false);
  });

  it("suggest boosting the best post, and leave the amount to the owner", () => {
    const best = post({ got: 40, leads: 1 });
    const recs = recommendations(
      input([best, post({ got: 4 }), post({ got: 5 })]),
    );
    const rec = recs.find((r) => r.key === `worth-boosting:${best.id}`)!;
    expect(rec.body[0]).toContain("40 reactions, comments and shares");
    expect(rec.body[0]).toContain("You choose the amount");
    expect(rec.body[0]).not.toMatch(/₱|\bpesos?\b/);
    // Nothing to suggest once it is boosted, or when it is old.
    expect(
      keys(
        input([{ ...best, adViews: 10 }, post({ got: 4 }), post({ got: 5 })]),
      ),
    ).not.toContain("worth-boosting");
    expect(
      keys(
        input([
          { ...best, postedAt: daysAgo(40) },
          post({ got: 4 }),
          post({ got: 5 }),
        ]),
      ),
    ).not.toContain("worth-boosting");
  });

  it("notice a post people saw without asking, and a listing with no public page", () => {
    const seen = post({ got: 20, views: 800 });
    expect(recommendations(input([seen]))[0]!.key).toBe(
      `seen-not-asked:${seen.id}`,
    );
    expect(recommendations(input([seen]))[0]!.body[0]).toContain("800 views");
    const hidden = post({ got: 20, listing: { ...house, isPublic: false } });
    expect(recommendations(input([hidden]))[0]!.key).toBe(
      `no-public-page:${hidden.id}`,
    );
    expect(keys(input([post({ got: 20, leads: 1 })]))).not.toContain(
      "seen-not-asked",
    );
  });

  it("notice a video people leave early", () => {
    const video = post({
      kind: "video",
      video: {
        plays: 200,
        paidPlays: 0,
        avgWatchMs: 3000,
        lengthMs: 18_000,
        completes: 5,
      },
    });
    const rec = recommendations(input([video])).find(
      (r) => r.key === `leave-early:${video.id}`,
    )!;
    expect(rec.body[0]).toContain("3 seconds of the 18-second video");
    expect(rec.action?.href).toBe("/app/video?property=L1");
    const held = post({
      kind: "video",
      video: {
        plays: 200,
        paidPlays: 0,
        avgWatchMs: 9000,
        lengthMs: 18_000,
        completes: 50,
      },
    });
    expect(keys(input([held]))).not.toContain("leave-early");
    const few = post({
      kind: "video",
      video: {
        plays: 10,
        paidPlays: 0,
        avgWatchMs: 1000,
        lengthMs: 18_000,
        completes: 0,
      },
    });
    expect(keys(input([few]))).not.toContain("leave-early");
  });

  it("compare videos with photo posts only with two of each", () => {
    const v = () => post({ kind: "video", got: 12 });
    const p = () => post({ got: 3 });
    expect(keys(input([v(), v(), p(), p()]))).toContain("videos-win");
    // A boosted video's reactions were bought, so it isn't part of the comparison.
    expect(
      keys(
        input([
          v(),
          post({ kind: "video", got: 500, adViews: 9000, leads: 1 }),
          p(),
          p(),
        ]),
      ),
    ).not.toContain("videos-win");
    expect(keys(input([v(), p(), p()]))).not.toContain("videos-win");
    expect(
      keys(
        input([
          post({ kind: "video", got: 2 }),
          post({ kind: "video", got: 2 }),
          post({ got: 9 }),
          post({ got: 9 }),
        ]),
      ),
    ).toContain("photos-win");
  });

  it("point at listings never posted, and at a long silence", () => {
    const listings = [
      { id: "L1", name: "Sample House", isPublic: true, views30: 5 },
      { id: "L2", name: "Sample Lot", isPublic: true, views30: 30 },
      { id: "L3", name: "Sample Condo", isPublic: true, views30: 0 },
    ];
    const recs = recommendations(input([post({ age: 20 })], { listings }));
    const never = recs.find((r) => r.key === "never-posted")!;
    expect(never.title).toBe("2 Listings Haven't Been Posted");
    expect(never.body[0]).toContain(
      "Start with Sample Lot: its page had 30 views",
    );
    expect(recs.find((r) => r.key === "stale")!.body[0]).toContain(
      "20 days ago",
    );
  });

  it("give at most five, one per post, and write both languages", () => {
    const many = [
      post({ adViews: 900, leads: 2 }),
      post({ adViews: 900, listing: lot }),
      post({ got: 60, leads: 1 }),
      post({ got: 30, views: 900 }),
      post({
        kind: "video",
        got: 2,
        age: 30,
        video: {
          plays: 200,
          paidPlays: 0,
          avgWatchMs: 2000,
          lengthMs: 18_000,
          completes: 1,
        },
      }),
      post({ kind: "video", got: 2 }),
      post({ got: 9 }),
    ];
    const recs = recommendations(
      input(many, {
        listings: [
          { id: "L9", name: "Sample Condo", isPublic: true, views30: 3 },
        ],
      }),
    );
    expect(recs.length).toBe(5);
    const ids = recs.map((r) => r.key.split(":")[1]).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of recs) {
      expect(r.body[0].length).toBeGreaterThan(20);
      expect(r.body[1]).not.toBe(r.body[0]);
    }
  });
});

describe("a listing's numbers around a post", () => {
  it("counts page views on the 7 days from the post and the 7 before, in Manila days", () => {
    // Posted 20 Nov, 23:30 UTC, which is already 21 Nov in Manila.
    const posted = "2026-11-20T23:30:00Z";
    const views = new Map([
      ["2026-11-14", 9],
      ["2026-11-20", 4],
      ["2026-11-21", 6],
      ["2026-11-27", 5],
      ["2026-11-28", 100],
    ]);
    const got = afterNumbers(
      posted,
      new Date("2026-12-10T00:00:00Z"),
      views,
      [],
      [],
    );
    expect(got).toEqual({
      days: 7,
      views: 11,
      viewsBefore: 13,
      inquiries: 0,
      chats: 0,
    });
  });

  it("counts inquiries and chats that arrived in the week after, not before or later", () => {
    const posted = "2026-11-20T02:00:00Z";
    const got = afterNumbers(
      posted,
      new Date("2026-12-10T00:00:00Z"),
      new Map(),
      [
        "2026-11-19T23:00:00Z",
        "2026-11-20T02:00:00Z",
        "2026-11-26T23:00:00Z",
        "2026-11-27T02:00:00Z",
      ],
      ["2026-11-22T00:00:00Z"],
    );
    expect([got.inquiries, got.chats]).toEqual([2, 1]);
  });

  it("uses the days so far for a newer post", () => {
    const got = afterNumbers(
      "2026-11-25T02:00:00Z",
      NOW,
      new Map([
        ["2026-11-25", 2],
        ["2026-11-27", 3],
        ["2026-11-29", 50],
      ]),
      ["2026-11-26T00:00:00Z"],
      [],
    );
    expect(got).toEqual({
      days: 3,
      views: 5,
      viewsBefore: 0,
      inquiries: 1,
      chats: 0,
    });
  });
});
