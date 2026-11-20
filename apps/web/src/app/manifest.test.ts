import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const publicDir = fileURLToPath(new URL("../../public", import.meta.url));

describe("install manifest", () => {
  const m = manifest();

  it("opens the installed app full screen on the dashboard", () => {
    expect(m.start_url).toBe("/app");
    expect(m.display).toBe("standalone");
  });

  it("has the icon sizes phones ask for, and every icon file exists", () => {
    const icons = m.icons ?? [];
    for (const size of ["192x192", "512x512"]) {
      expect(icons.some((i) => i.sizes === size && i.purpose === "any")).toBe(true);
      expect(icons.some((i) => i.sizes === size && i.purpose === "maskable")).toBe(true);
    }
    for (const icon of icons) expect(existsSync(publicDir + icon.src), icon.src).toBe(true);
  });
});
