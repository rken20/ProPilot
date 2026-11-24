import { describe, expect, it } from "vitest";
import {
  defaultUntil,
  manilaDate,
  paidBusinesses,
  validUntil,
} from "./admin-accounts";

const now = new Date("2026-11-24T11:30:00Z"); // 7:30 pm in Manila

describe("dates on the plan form", () => {
  it("are calendar dates in Manila", () => {
    expect(manilaDate(now)).toBe("2026-11-24");
    expect(manilaDate(new Date("2026-11-24T17:00:00Z"))).toBe("2026-11-25");
  });

  it("start on the day the current plan ends, or a month from today", () => {
    expect(defaultUntil("2027-02-23T15:59:59Z", now)).toBe("2027-02-23");
    expect(defaultUntil(null, now)).toBe("2026-12-24");
    expect(defaultUntil("2026-01-01T00:00:00Z", now)).toBe("2026-12-24");
  });

  it("are accepted only when real, not in the past and within five years", () => {
    expect(validUntil("2026-11-24", now)).toBe(true);
    expect(validUntil("2027-06-30", now)).toBe(true);
    expect(validUntil("2026-11-23", now)).toBe(false);
    expect(validUntil("2032-01-01", now)).toBe(false);
    expect(validUntil("2027-02-30", now)).toBe(false);
    expect(validUntil("30/06/2027", now)).toBe(false);
    expect(validUntil("", now)).toBe(false);
  });
});

it("counts every business not on Free as on a paid plan", () => {
  expect(paidBusinesses({ free: 7, basic: 2, pro: 1, agency: 1 })).toBe(4);
  expect(paidBusinesses({})).toBe(0);
});
