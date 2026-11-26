import { describe, expect, it } from "vitest";
import {
  MUSIC_FOR,
  MUSIC_IDS,
  musicChoice,
  musicNotes,
  musicShape,
  soundCues,
} from "./sound";
import { CAPTION_AT, PRICE_AT, TEMPLATE_IDS, buildTimeline } from "./spec";

const lines = ["Corner lot", "Near the school", "Gated village"];
const DRUMS = ["kick", "snare", "clap", "rim", "hat", "open", "crash"];

describe("musicNotes", () => {
  it("writes every track within the ad, the same way each time, at any template's tempo", () => {
    for (const template of TEMPLATE_IDS) {
      const shape = musicShape(buildTimeline(template, 6, lines));
      for (const track of MUSIC_IDS) {
        const notes = musicNotes(track, shape);
        expect(notes.length).toBeGreaterThan(30);
        expect(musicNotes(track, shape)).toEqual(notes);
        for (const n of notes) {
          expect(n.t).toBeGreaterThanOrEqual(0);
          expect(n.t).toBeLessThan(shape.duration);
          expect(n.t + n.dur).toBeLessThanOrEqual(shape.duration + 1e-6);
          expect(n.dur).toBeGreaterThan(0);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
        }
        // In time order, so the instruments can be scheduled straight through.
        expect(notes.map((n) => n.t)).toEqual(
          [...notes.map((n) => n.t)].sort((a, b) => a - b),
        );
      }
    }
  });

  it("follows the video: a light intro under the headline, the beat from the first cut, a landing on the closing card", () => {
    const tl = buildTimeline("showcase", 6, lines);
    const shape = musicShape(tl);
    expect(shape.bpm).toBe(tl.bpm);
    expect(shape.drop).toBeCloseTo(tl.scenes[1]!.start, 6);
    expect(shape.outro).toBeCloseTo(tl.scenes[tl.scenes.length - 1]!.start, 6);
    for (const track of MUSIC_IDS) {
      const notes = musicNotes(track, shape);
      const kicks = notes.filter((n) => n.voice === "kick").map((n) => n.t);
      expect(kicks.length).toBeGreaterThan(2);
      expect(kicks.every((t) => t >= shape.drop - 0.01)).toBe(true);
      // One crash, exactly where the closing card starts.
      const crashes = notes.filter((n) => n.voice === "crash");
      expect(crashes).toHaveLength(1);
      expect(crashes[0]!.t).toBeCloseTo(shape.outro, 2);
    }
    // The upbeat tracks put a kick on every beat between the first cut and the closing card.
    for (const track of ["bright", "pulse"] as const) {
      const kicks = musicNotes(track, shape).filter(
        (n) => n.voice === "kick" && n.t < shape.outro - 0.01,
      );
      expect(kicks).toHaveLength(
        Math.round((shape.outro - shape.drop) / tl.beat),
      );
      for (const k of kicks)
        expect(
          Math.abs(k.t / tl.beat - Math.round(k.t / tl.beat)),
        ).toBeLessThan(0.01);
    }
  });

  it("keeps the calm and luxe tracks light on drums", () => {
    const shape = musicShape(buildTimeline("elegant", 6, lines));
    for (const track of ["calm", "luxe"] as const) {
      const notes = musicNotes(track, shape);
      expect(
        notes.some(
          (n) =>
            n.voice === "clap" || n.voice === "snare" || n.voice === "open",
        ),
      ).toBe(false);
      expect(notes.filter((n) => DRUMS.includes(n.voice)).length).toBeLessThan(
        notes.length / 2,
      );
    }
  });

  it("returns nothing for an ad with no length", () => {
    expect(
      musicNotes("bright", { bpm: 112, duration: 0, drop: 0, outro: 0 }),
    ).toEqual([]);
  });
});

describe("soundCues", () => {
  it("has a track for every template, and takes the AI's choice only when it's one of ours", () => {
    for (const t of TEMPLATE_IDS) expect(MUSIC_IDS).toContain(MUSIC_FOR[t]);
    expect(musicChoice("luxe", "bold")).toBe("luxe");
    expect(musicChoice("own", "bold")).toBe("pulse");
    expect(musicChoice(undefined, "facts")).toBe("calm");
  });

  it("puts a whoosh on every cut and a pop as every caption comes in", () => {
    const tl = buildTimeline("showcase", 6, lines);
    const cues = soundCues("showcase", tl);
    const at = (x: number) => Math.round(x * 1000) / 1000;
    const captioned = tl.scenes.filter((s) => s.kind === "photo" && s.line);
    const quick = tl.scenes.filter((s) => s.kind === "photo" && !s.line);
    expect(quick.length).toBeGreaterThan(0);
    const outro = tl.scenes[tl.scenes.length - 1]!;
    expect(cues.filter((c) => c.effect === "whoosh").map((c) => c.t)).toEqual(
      [...captioned, outro].map((s) => at(s.start + tl.cut / 2)),
    );
    // A quick clip gets the lighter sound.
    expect(cues.filter((c) => c.effect === "swish").map((c) => c.t)).toEqual(
      quick.map((s) => at(s.start + tl.cut / 2)),
    );
    // The headline's pop, then one per caption, just as its first word lands.
    const pops = cues.filter((c) => c.effect === "pop");
    expect(pops).toHaveLength(1 + captioned.length);
    expect(pops[1]!.t).toBeGreaterThanOrEqual(captioned[0]!.start + CAPTION_AT);
    // It rises into the closing card and chimes as the price lands.
    expect(cues.find((c) => c.effect === "riser")?.t).toBeCloseTo(
      outro.start,
      3,
    );
    expect(cues.find((c) => c.effect === "chime")?.t).toBeCloseTo(
      outro.start + PRICE_AT.normal,
      3,
    );
    for (const c of cues) {
      expect(c.t).toBeGreaterThanOrEqual(0);
      expect(c.t).toBeLessThan(tl.duration);
    }
    expect(cues.map((c) => c.t)).toEqual(
      [...cues.map((c) => c.t)].sort((a, b) => a - b),
    );
  });

  it("ticks through the lines in the templates that count or list facts", () => {
    for (const template of ["facts", "reasons"] as const) {
      const cues = soundCues(template, buildTimeline(template, 4, lines));
      expect(cues.filter((c) => c.effect === "tick")).toHaveLength(3);
      expect(cues.filter((c) => c.effect === "pop")).toHaveLength(1);
    }
  });

  it("builds up to the price in Price Reveal and hits as it lands", () => {
    const tl = buildTimeline("reveal", 4, lines);
    const cues = soundCues("reveal", tl);
    const outro = tl.scenes[tl.scenes.length - 1]!;
    expect(cues.find((c) => c.effect === "hit")?.t).toBeCloseTo(
      outro.start + PRICE_AT.reveal,
      3,
    );
    expect(cues.filter((c) => c.effect === "riser").map((c) => c.t)).toEqual(
      [outro.start, outro.start + PRICE_AT.reveal].map(
        (x) => Math.round(x * 1000) / 1000,
      ),
    );
    expect(cues.some((c) => c.effect === "chime")).toBe(false);
  });
});
