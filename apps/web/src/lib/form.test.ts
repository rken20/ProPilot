import { describe, expect, it } from "vitest";
import { safeNext } from "./form";

describe("safeNext (open-redirect guard)", () => {
  it("keeps same-site paths with their query and hash", () => {
    expect(safeNext("/app/leads?show=new#x")).toBe("/app/leads?show=new#x");
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
  });

  it("refuses anything that could leave the site", () => {
    for (const evil of [
      "//evil.com",
      "/\\evil.com",
      "\\\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "evil.com",
      " /app",
    ]) {
      expect(safeNext(evil)).toBe("/app");
    }
  });

  it("falls back when empty", () => {
    expect(safeNext(null)).toBe("/app");
    expect(safeNext(undefined, "/start")).toBe("/start");
  });
});
