import { describe, expect, it } from "vitest";
import { qrPath } from "./qr";

describe("qrPath", () => {
  it("draws a square code with a quiet border and the three corner markers", () => {
    const { size, path } = qrPath("https://example.com/get-app");
    // Version 1 is 21 cells; longer text needs more. Plus 4 quiet cells each side.
    expect(size).toBeGreaterThanOrEqual(21 + 8);
    expect((size - 8 - 21) % 4).toBe(0);
    // Corner markers start dark at the top-left, top-right and bottom-left cells.
    expect(path).toContain("M4 4h1v1h-1z");
    expect(path).toContain(`M${size - 5} 4h1v1h-1z`);
    expect(path).toContain(`M4 ${size - 5}h1v1h-1z`);
    // Nothing is drawn in the quiet border.
    expect(path).not.toMatch(/M[0-3] /);
  });

  it("gives a different code for a different address", () => {
    expect(qrPath("https://a.example/get-app").path).not.toBe(qrPath("https://b.example/get-app").path);
  });
});
