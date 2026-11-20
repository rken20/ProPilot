/**
 * Dashboard maths. Pure functions, so every number on the dashboard can be
 * tested without a database. Days and months are Manila days (UTC+8).
 */
import { buckets, inRange, parseRange, type Range } from "./reports";

/** Change from the previous period, as a whole percent. null when there is nothing to compare with. */
export function changePct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Viewings that fall in this calendar month and the one before, by the day they are held. */
export function viewingsByMonth(times: string[], now = new Date()): { thisMonth: number; lastMonth: number } {
  const current = parseRange({ range: "month" }, now);
  const month = (r: { from: Date }) => {
    const d = new Date(r.from.getTime() + 8 * 3_600_000);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  };
  // "This month" runs to the end of the month here: a viewing booked for next week still counts.
  const key = (iso: string) => month({ from: new Date(iso) });
  const thisKey = month(current);
  return {
    thisMonth: times.filter((t) => key(t) === thisKey).length,
    lastMonth: times.filter((t) => key(t) === thisKey - 1).length,
  };
}

export type PerfPoint = { label: string; views: number; inquiries: number; viewings: number };

/**
 * Running totals per day across the range: views of public listing pages, new
 * inquiries and viewings held. `inquiriesPerDay` lines up with `buckets(r)`.
 */
export function performanceSeries(
  r: Range,
  viewRows: Array<{ day: string; views: number }>,
  inquiriesPerDay: number[],
  viewingTimes: string[],
): PerfPoint[] {
  const viewsOn = new Map<string, number>();
  for (const v of viewRows) viewsOn.set(v.day, (viewsOn.get(v.day) ?? 0) + v.views);
  let views = 0;
  let inquiries = 0;
  let viewings = 0;
  return buckets(r).map((b, i) => {
    // listing_views.day is the Manila calendar day.
    const day = new Date(b.start.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
    views += viewsOn.get(day) ?? 0;
    inquiries += inquiriesPerDay[i] ?? 0;
    viewings += viewingTimes.filter((t) => inRange(t, { from: b.start, to: b.end })).length;
    return { label: b.label, views, inquiries, viewings };
  });
}

/** A round top for a chart axis and the step between its gridlines (at most 4 steps). */
export function niceScale(max: number): { max: number; step: number } {
  const top = Math.max(1, Math.ceil(max));
  for (let pow = 1; ; pow *= 10) {
    for (const s of [1, 2, 5]) {
      const step = s * pow;
      const steps = Math.ceil(top / step);
      if (steps <= 4) return { max: steps * step, step };
    }
  }
}
