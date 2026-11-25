import { describe, expect, it } from "vitest";
import { MUSIC_FOR, MUSIC_IDS, musicNotes, soundCues } from "./sound";
import { TEMPLATE_IDS, buildTimeline } from "./spec";

const lines = ["Corner lot", "Near the school", "Gated village"];

describe("musicNotes", () => {
  it("writes every track within the ad, the same way each time", () => {
    for (const track of MUSIC_IDS) {
      const notes = musicNotes(track, 18.4);
      expect(notes.length).toBeGreaterThan(20);
      expect(musicNotes(track, 18.4)).toEqual(notes);
      for (const n of notes) {
        expect(n.t).toBeGreaterThanOrEqual(0);
        expect(n.t).toBeLessThan(18.4);
        expect(n.t + n.dur).toBeLessThanOrEqual(18.4 + 1e-6);
        expect(n.dur).toBeGreaterThan(0);
        expect(n.vel).toBeGreaterThan(0);
        expect(n.vel).toBeLessThanOrEqual(1);
      }
      // In time order, so the instruments can be scheduled straight through.
      expect(notes.map((n) => n.t)).toEqual(
        [...notes.map((n) => n.t)].sort((a, b) => a - b),
      );
    }
  });

  it("keeps the first bar light so the beat comes in under the headline", () => {
    const pulse = musicNotes("pulse", 12);
    const bar = (60 / 100) * 4;
    expect(pulse.some((n) => n.voice === "kick" && n.t < bar)).toBe(false);
    expect(pulse.some((n) => n.voice === "kick" && n.t >= bar)).toBe(true);
  });

  it("has no drums in the calm and luxe tracks", () => {
    for (const track of ["calm", "luxe"] as const) {
      expect(
        musicNotes(track, 20).some((n) =>
          ["kick", "snare", "hat"].includes(n.voice),
        ),
      ).toBe(false);
    }
  });

  it("returns nothing for an ad with no length", () => {
    expect(musicNotes("bright", 0)).toEqual([]);
  });
});

describe("soundCues", () => {
  it("suggests a track for every template", () => {
    for (const t of TEMPLATE_IDS) expect(MUSIC_IDS).toContain(MUSIC_FOR[t]);
  });

  it("puts a whoosh on every cut and a pop on every feature line", () => {
    const tl = buildTimeline("showcase", 5, lines);
    const cues = soundCues("showcase", tl);
    const cuts = tl.scenes.filter((s) => s.kind !== "intro");
    expect(cues.filter((c) => c.effect === "whoosh").map((c) => c.t)).toEqual(
      cuts.map((s) => Math.round((s.start + tl.fade / 2) * 1000) / 1000),
    );
    // The headline's pop, then one per scene with a line.
    const withLine = tl.scenes.filter(
      (s) => s.kind === "photo" && s.line,
    ).length;
    expect(cues.filter((c) => c.effect === "pop")).toHaveLength(1 + withLine);
    expect(cues.filter((c) => c.effect === "chime")).toHaveLength(1);
    for (const c of cues) {
      expect(c.t).toBeGreaterThanOrEqual(0);
      expect(c.t).toBeLessThan(tl.duration);
    }
  });

  it("ticks through the lines in the templates that count or list facts", () => {
    for (const template of ["facts", "reasons"] as const) {
      const cues = soundCues(template, buildTimeline(template, 4, lines));
      expect(cues.filter((c) => c.effect === "tick").length).toBeGreaterThan(0);
      expect(cues.filter((c) => c.effect === "pop")).toHaveLength(1);
    }
  });

  it("builds up to the price in Price Reveal and lands as it opens", () => {
    const tl = buildTimeline("reveal", 4, lines);
    const cues = soundCues("reveal", tl);
    const outro = tl.scenes[tl.scenes.length - 1]!;
    expect(cues.find((c) => c.effect === "hit")?.t).toBeCloseTo(
      outro.start + 1.0,
      3,
    );
    expect(cues.find((c) => c.effect === "riser")?.t).toBeCloseTo(
      outro.start + 1.0,
      3,
    );
    expect(cues.some((c) => c.effect === "chime")).toBe(false);
  });
});
