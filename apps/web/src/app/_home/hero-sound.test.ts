import { describe, expect, it } from "vitest";
import { HERO_SEQUENCE } from "./hero-sequence";
import { cuesBetween } from "./hero-sound";

describe("scroll opening sound cues", () => {
  it("are in order, inside the clip, and after the build that plays by itself", () => {
    const at = HERO_SEQUENCE.cues.map((c) => c.at);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(at.every((t) => t > 0 && t <= 1)).toBe(true);
    // Everything from the resting point on is within reach of the scroll.
    expect(at.filter((t) => t > HERO_SEQUENCE.rest).length).toBeGreaterThan(10);
  });

  it("plays a part's sound once, as the build passes it going forward", () => {
    expect(cuesBetween(0.44, 0.46)).toEqual([{ effect: "thud", level: 1 }]);
    expect(cuesBetween(0.46, 0.47)).toEqual([]);
    expect(cuesBetween(0.5, 0.5)).toEqual([]);
  });

  it("ends on the chime", () => {
    expect(cuesBetween(0.94, 1).at(-1)).toEqual({ effect: "chime", level: 1 });
  });

  it("plays quiet ticks going backward", () => {
    expect(cuesBetween(0.46, 0.44)).toEqual([{ effect: "tick", level: 0.6 }]);
  });

  it("keeps a fast flick to a few sounds", () => {
    expect(cuesBetween(0.3, 1)).toHaveLength(3);
    expect(cuesBetween(0.3, 1).at(-1)?.effect).toBe("chime");
    expect(cuesBetween(1, 0.3)).toHaveLength(3);
  });
});
