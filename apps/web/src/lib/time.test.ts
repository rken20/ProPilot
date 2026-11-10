import { describe, expect, it } from "vitest";
import { greeting, timeAgo } from "./time";

describe("greeting", () => {
  it("uses Philippine time, not the server's", () => {
    // 01:00 UTC = 09:00 in Manila
    expect(greeting(new Date("2026-11-10T01:00:00Z"))).toBe("Good morning");
    // 07:00 UTC = 15:00 in Manila
    expect(greeting(new Date("2026-11-10T07:00:00Z"))).toBe("Good afternoon");
    // 12:00 UTC = 20:00 in Manila
    expect(greeting(new Date("2026-11-10T12:00:00Z"))).toBe("Good evening");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("formats recent times", () => {
    expect(timeAgo("2026-11-10T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-11-10T11:55:00Z", now)).toBe("5 min ago");
    expect(timeAgo("2026-11-10T09:00:00Z", now)).toBe("3 hr ago");
    expect(timeAgo("2026-11-09T12:00:00Z", now)).toBe("1 day ago");
  });
});
