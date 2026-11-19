import { describe, expect, it } from "vitest";
import { cleanGcashReference, daysLeft, effectivePlanCode } from "./plan-rules";

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
