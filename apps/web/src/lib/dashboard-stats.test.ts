import { describe, expect, it } from "vitest";
import { changePct, niceScale, performanceSeries, viewingsByMonth } from "./dashboard-stats";
import { parseRange } from "./reports";

describe("changePct", () => {
  it("gives the change from the previous period as a whole percent", () => {
    expect(changePct(28, 20)).toBe(40);
    expect(changePct(5, 3)).toBe(67);
    expect(changePct(3, 6)).toBe(-50);
    expect(changePct(4, 4)).toBe(0);
  });

  it("has nothing to say when the previous period was empty", () => {
    expect(changePct(5, 0)).toBeNull();
    expect(changePct(0, 0)).toBeNull();
  });
});

describe("viewingsByMonth", () => {
  // 20 Nov 2026, 10:00 in Manila.
  const now = new Date("2026-11-20T02:00:00Z");

  it("counts viewings by the Manila month they are held in, including ones still to come", () => {
    const times = [
      "2026-11-02T03:00:00Z",
      "2026-11-28T06:00:00Z", // next week, still this month
      "2026-10-15T01:00:00Z",
      "2026-10-31T15:59:00Z", // 23:59 on 31 Oct in Manila
      "2026-10-31T16:00:00Z", // midnight on 1 Nov in Manila
      "2026-09-30T10:00:00Z", // two months back: ignored
    ];
    expect(viewingsByMonth(times, now)).toEqual({ thisMonth: 3, lastMonth: 2 });
  });

  it("handles January, whose last month is December of the year before", () => {
    const jan = new Date("2027-01-10T02:00:00Z");
    expect(viewingsByMonth(["2026-12-20T02:00:00Z", "2027-01-05T02:00:00Z"], jan)).toEqual({ thisMonth: 1, lastMonth: 1 });
  });
});

describe("performanceSeries", () => {
  const now = new Date("2026-11-20T02:00:00Z");
  const range = parseRange({ range: "7" }, now); // 14 to 20 Nov, Manila days

  it("adds up views, inquiries and viewings day by day", () => {
    const points = performanceSeries(
      range,
      [
        { day: "2026-11-14", views: 10 },
        { day: "2026-11-14", views: 5 }, // a second listing on the same day
        { day: "2026-11-16", views: 20 },
        { day: "2026-11-01", views: 99 }, // before the range
      ],
      [1, 0, 2, 0, 0, 0, 1],
      ["2026-11-15T04:00:00Z", "2026-11-20T01:00:00Z", "2026-11-25T01:00:00Z"],
    );
    expect(points).toHaveLength(7);
    expect(points.map((p) => p.views)).toEqual([15, 15, 35, 35, 35, 35, 35]);
    expect(points.map((p) => p.inquiries)).toEqual([1, 1, 3, 3, 3, 3, 4]);
    expect(points.map((p) => p.viewings)).toEqual([0, 1, 1, 1, 1, 1, 2]);
    expect(points[0]!.label).toBe("Nov 14");
  });

  it("stays at zero when nothing happened", () => {
    const points = performanceSeries(range, [], [], []);
    expect(points.every((p) => p.views === 0 && p.inquiries === 0 && p.viewings === 0)).toBe(true);
  });
});

describe("niceScale", () => {
  it("picks a round top with at most four steps", () => {
    expect(niceScale(0)).toEqual({ max: 1, step: 1 });
    expect(niceScale(3)).toEqual({ max: 3, step: 1 });
    expect(niceScale(7)).toEqual({ max: 8, step: 2 });
    expect(niceScale(138)).toEqual({ max: 150, step: 50 });
    expect(niceScale(1001)).toEqual({ max: 1500, step: 500 });
  });
});
