/**
 * The frames the home page plays as the visitor scrolls: a house building itself.
 *
 * To swap in a new clip, run `scripts/hero-frames.sh <clip>` (it writes a new
 * folder under `public/hero-seq/`), then update `dir`, the counts and `bg` here.
 * The folder name changes with every clip because the files are cached for a year.
 */
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
} as const;

export function framePath(set: "desktop" | "mobile", index: number): string {
  const s = HERO_SEQUENCE[set];
  return `${HERO_SEQUENCE.dir}/${s.folder}/${String(index).padStart(3, "0")}.webp`;
}
