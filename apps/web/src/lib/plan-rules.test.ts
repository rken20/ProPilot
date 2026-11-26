import { describe, expect, it } from "vitest";
import { addMonths, cleanGcashReference, daysLeft, effectivePlanCode, paidUntil, validMonths } from "./plan-rules";

const NOW = new Date("2026-11-19T12:00:00+08:00");

describe("plan rules", () => {
  it("uses the paid plan only while its period lasts", () => {
    expect(effectivePlanCode(null, NOW)).toBe("free");
    expect(effectivePlanCode({ code: "basic", current_period_end: "2026-12-19T12:00:00+08:00" }, NOW)).toBe("basic");
    expect(effectivePlanCode({ code: "basic", current_period_end: "2026-11-19T11:59:00+08:00" }, NOW)).toBe("free");
  });

  it("counts days left, rounding up", () => {
    expect(daysLeft("2026-11-20T13:00:00+08:00", NOW)).toBe(2);
    expect(daysLeft("2026-11-01T00:00:00+08:00", NOW)).toBe(0);
    expect(daysLeft(null, NOW)).toBeNull();
  });

  it("accepts 13-digit GCash references, with or without spaces", () => {
    expect(cleanGcashReference("1012 345 678901")).toBe("1012345678901");
    expect(cleanGcashReference("12345")).toBeNull();
    expect(cleanGcashReference("abcdefghijklm")).toBeNull();
  });
});

describe("choosing how many months to pay for", () => {
  it("takes any whole number from 1 to 12", () => {
    expect([1, 2, 5, 12].every(validMonths)).toBe(true);
    expect([0, 13, 1.5, -3, Number.NaN].some(validMonths)).toBe(false);
  });

  it("adds calendar months, ending on the month's last day when it is shorter", () => {
    expect(addMonths(new Date("2026-11-26T04:00:00Z"), 3).toISOString()).toBe("2027-02-26T04:00:00.000Z");
    expect(addMonths(new Date("2026-11-30T04:00:00Z"), 3).toISOString()).toBe("2027-02-28T04:00:00.000Z");
    expect(addMonths(new Date("2026-01-31T04:00:00Z"), 12).toISOString()).toBe("2027-01-31T04:00:00.000Z");
  });

  it("starts a first plan, or a different plan, on the day it is confirmed", () => {
    expect(paidUntil(NOW, { code: "free", periodEnd: null }, "pro", 6)).toEqual({ until: addMonths(NOW, 6), addsOn: false });
    expect(paidUntil(NOW, { code: "basic", periodEnd: "2027-03-01T00:00:00Z" }, "pro", 2)).toEqual({ until: addMonths(NOW, 2), addsOn: false });
  });

  it("adds the months to the end when renewing the same plan early", () => {
    const got = paidUntil(NOW, { code: "pro", periodEnd: "2027-03-01T00:00:00Z" }, "pro", 5);
    expect(got.addsOn).toBe(true);
    expect(got.until.toISOString()).toBe("2027-08-01T00:00:00.000Z");
  });

  it("starts again from today when the old period has already ended", () => {
    expect(paidUntil(NOW, { code: "pro", periodEnd: "2026-11-01T00:00:00Z" }, "pro", 1)).toEqual({ until: addMonths(NOW, 1), addsOn: false });
  });
});
