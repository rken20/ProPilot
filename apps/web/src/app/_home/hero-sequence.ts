/**
 * The frames the home page plays as the visitor scrolls: a house building itself.
 *
 * To swap in a new clip, run `scripts/hero-frames.sh <clip>` (it writes a new
 * folder under `public/hero-seq/`), then update `dir`, the counts and `bg` here.
 * The folder name changes with every clip because the files are cached for a year.
 */
export type HeroEffect = "thud" | "clack" | "roof" | "pop" | "tick" | "whoosh" | "chime";

export const HERO_SEQUENCE = {
  dir: "/hero-seq/v1",
  /** The clip's plain background. The stage is painted the same colour so the house floats on the page. */
  bg: "#0b1f4d",
  /** Frame size as width / height; both sets share it. */
  aspect: 1000 / 900,
  desktop: { folder: "d", count: 121 },
  /** Phones and data-saver: every second frame, smaller. */
  mobile: { folder: "m", count: 61 },
  /** Where the sequence rests before any scrolling (0 to 1): the walls are going up. */
  rest: 0.3,
  /**
   * Sound effects, for visitors who turn sound on: `at` is where in the clip
   * (0 to 1) a part lands. Re-time these when the clip changes.
   */
  cues: [
    { at: 0.16, effect: "thud" }, // foundation
    { at: 0.315, effect: "clack" }, // ground-floor walls
    { at: 0.35, effect: "clack" },
    { at: 0.385, effect: "clack" },
    { at: 0.415, effect: "clack" },
    { at: 0.45, effect: "thud" }, // floor between storeys
    { at: 0.53, effect: "clack" }, // upper walls
    { at: 0.56, effect: "clack" },
    { at: 0.59, effect: "clack" },
    { at: 0.62, effect: "thud" }, // flat roof
    { at: 0.675, effect: "roof" }, // main roof
    { at: 0.705, effect: "pop" }, // door
    { at: 0.73, effect: "pop" }, // windows
    { at: 0.76, effect: "pop" },
    { at: 0.785, effect: "pop" },
    { at: 0.81, effect: "tick" }, // path stones
    { at: 0.832, effect: "tick" },
    { at: 0.854, effect: "tick" },
    { at: 0.876, effect: "pop" }, // hedges and trees
    { at: 0.9, effect: "pop" },
    { at: 0.925, effect: "pop" },
    { at: 0.955, effect: "chime" }, // the windows light up
  ] as ReadonlyArray<{ at: number; effect: HeroEffect }>,
} as const;

export function framePath(set: "desktop" | "mobile", index: number): string {
  const s = HERO_SEQUENCE[set];
  return `${HERO_SEQUENCE.dir}/${s.folder}/${String(index).padStart(3, "0")}.webp`;
}
