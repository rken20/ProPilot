/**
 * The Video Ad Maker's sound, as plain data: which music track plays, the notes
 * it plays, and when the sound effects land. No audio code here, so it can be
 * unit-tested; `audio.ts` turns this into sound in the browser.
 *
 * The music is written here, note by note, so it is ours to use anywhere: no
 * licence, no song that Facebook or TikTok could mute.
 */
import type { TemplateId, Timeline } from "./spec";

export const MUSIC = {
  calm: {
    label: "Calm",
    about: ["Soft piano and strings.", "Malambot na piano at strings."],
    bpm: 84,
  },
  bright: {
    label: "Bright",
    about: [
      "Upbeat pop with a steady beat.",
      "Masigla, may tuloy-tuloy na beat.",
    ],
    bpm: 112,
  },
  luxe: {
    label: "Luxe",
    about: [
      "Slow, warm chords for premium homes.",
      "Mabagal at mainit na chords para sa premium homes.",
    ],
    bpm: 70,
  },
  pulse: {
    label: "Pulse",
    about: ["Light electronic beat.", "Magaan na electronic beat."],
    bpm: 100,
  },
} as const satisfies Record<
  string,
  { label: string; about: readonly [string, string]; bpm: number }
>;
export type MusicId = keyof typeof MUSIC;
export const MUSIC_IDS = Object.keys(MUSIC) as MusicId[];

/** No music, one of ours, or a file the owner picks on their device. */
export type MusicChoice = MusicId | "none" | "own";

/** The track each template starts with. The owner can pick any. */
export const MUSIC_FOR: Record<TemplateId, MusicId> = {
  showcase: "calm",
  bold: "bright",
  elegant: "luxe",
  facts: "pulse",
  reveal: "pulse",
  reasons: "bright",
};

export type Voice = "pad" | "keys" | "bell" | "bass" | "kick" | "snare" | "hat";
/** One note. `midi` is the pitch (60 is middle C); drums ignore it. `vel` is 0 to 1. */
export type Note = {
  t: number;
  voice: Voice;
  midi: number;
  dur: number;
  vel: number;
};

/** Chords as MIDI notes, one per bar. */
const C = [48, 52, 55]; // C major
const Am = [45, 48, 52];
const F = [41, 45, 48];
const G = [43, 47, 50];
const Em = [40, 43, 47];
const Cmaj7 = [48, 52, 55, 59];
const Am9 = [45, 48, 52, 55, 59];
const Fmaj7 = [41, 45, 48, 52];
const G6 = [43, 47, 50, 52];

const PROGRESSIONS: Record<MusicId, number[][]> = {
  calm: [C, Am, F, G],
  bright: [F, G, Em, Am],
  luxe: [Cmaj7, Am9, Fmaj7, G6],
  pulse: [Am, F, C, G],
};

/**
 * Every note of a track for an ad `duration` seconds long. The music stops a
 * little before the end, where `audio.ts` fades it out, and nothing starts
 * after the end.
 */
export function musicNotes(track: MusicId, duration: number): Note[] {
  const beat = 60 / MUSIC[track].bpm;
  const bar = beat * 4;
  const chords = PROGRESSIONS[track];
  const notes: Note[] = [];
  const add = (
    t: number,
    voice: Voice,
    midi: number,
    dur: number,
    vel: number,
  ) => {
    if (t < duration - 0.05)
      notes.push({
        t: round(t),
        voice,
        midi,
        dur: round(Math.min(dur, duration - t)),
        vel,
      });
  };
  for (let b = 0; b * bar < duration; b++) {
    const at = b * bar;
    const chord = chords[b % chords.length]!;
    const root = chord[0]!;
    // The first bar is lighter, so the beat comes in under the headline rather than over it.
    const intro = b === 0;
    switch (track) {
      case "calm":
        chord.forEach((m) => add(at, "pad", m + 12, bar, 0.35));
        add(at, "bass", root - 12, beat * 2, 0.5);
        add(at + beat * 2, "bass", root - 12, beat * 2, 0.4);
        // A broken chord on the eighth notes, up then down.
        [0, 1, 2, 1, 0, 1, 2, 1].forEach((k, i) =>
          add(
            at + (i * beat) / 2,
            "keys",
            chord[k]! + 24,
            beat,
            i % 2 ? 0.32 : 0.45,
          ),
        );
        break;
      case "bright":
        chord.forEach((m) => add(at, "pad", m + 12, bar, 0.22));
        for (let i = 0; i < 8; i++)
          add(
            at + (i * beat) / 2,
            "bass",
            root - 12 + (i === 7 ? 7 : 0),
            beat / 2,
            i % 2 ? 0.45 : 0.6,
          );
        for (let i = 0; i < 4; i++) {
          if (!intro || i >= 2) add(at + i * beat, "kick", 0, 0.3, 0.9);
          if (i % 2 === 1 && !intro) add(at + i * beat, "snare", 0, 0.2, 0.55);
          add(at + i * beat + beat / 2, "hat", 0, 0.05, 0.35);
          // Chord stabs on the off-beats.
          chord.forEach((m) =>
            add(at + i * beat + beat / 2, "keys", m + 24, beat / 3, 0.3),
          );
        }
        break;
      case "luxe":
        chord.forEach((m) => add(at, "pad", m + 12, bar * 1.1, 0.3));
        add(at, "bass", root - 12, bar, 0.45);
        // A few bell notes from the chord, high and far apart.
        add(at + beat, "bell", chord[chord.length - 1]! + 24, beat * 3, 0.3);
        add(at + beat * 2.5, "bell", chord[1]! + 36, beat * 2, 0.22);
        break;
      case "pulse":
        chord.forEach((m) => add(at, "pad", m + 12, bar, 0.25));
        add(at, "bass", root - 12, beat * 1.5, 0.6);
        add(at + beat * 1.5, "bass", root - 12, beat / 2, 0.45);
        add(at + beat * 2, "bass", root - 12, beat * 2, 0.55);
        if (!intro) {
          add(at, "kick", 0, 0.3, 0.85);
          add(at + beat * 2, "kick", 0, 0.3, 0.85);
          add(at + beat * 3, "snare", 0, 0.2, 0.4);
        }
        for (let i = 0; i < 16; i++)
          add(at + (i * beat) / 4, "hat", 0, 0.04, i % 4 === 2 ? 0.3 : 0.15);
        [0, 1, 2, 1].forEach((k, i) =>
          add(at + i * beat + beat / 2, "keys", chord[k]! + 24, beat / 2, 0.3),
        );
        break;
    }
  }
  return notes.sort((a, b) => a.t - b.t);
}

export type Effect = "whoosh" | "pop" | "tick" | "chime" | "riser" | "hit";
/** A sound effect, with `t` the moment it should be heard most (a whoosh peaks at the cut). */
export type Cue = { t: number; effect: Effect };

/**
 * Where the sound effects go: a whoosh on every cut, a pop when a feature line
 * comes in (a tick in the templates that count or list facts), and a chime on
 * the closing card. Price Reveal builds up to the price instead and lands on it.
 * The times follow the drawing code in `draw.ts`.
 */
export function soundCues(template: TemplateId, timeline: Timeline): Cue[] {
  const cues: Cue[] = [{ t: 0.15, effect: "pop" }];
  const lineSound: Effect =
    template === "facts" || template === "reasons" ? "tick" : "pop";
  for (const scene of timeline.scenes) {
    if (scene.kind === "intro") continue;
    // Scenes cross over during `fade`: the cut is felt in the middle of it.
    cues.push({ t: scene.start + timeline.fade / 2, effect: "whoosh" });
    // A line slides in from 0.15 s to 0.55 s into its scene (`enter` in draw.ts): the pop is heard as it settles, clear of the whoosh.
    if (scene.kind === "photo" && scene.line)
      cues.push({ t: scene.start + 0.5, effect: lineSound });
    if (scene.kind === "outro") {
      if (template === "reveal") {
        // The price is uncovered from 0.9 s into the closing card (see `closing` in draw.ts):
        // the riser builds up to that moment and the hit lands as it opens.
        cues.push({ t: scene.start + 1.0, effect: "riser" });
        cues.push({ t: scene.start + 1.0, effect: "hit" });
      } else {
        cues.push({ t: scene.start + 0.6, effect: "chime" });
      }
    }
  }
  return cues
    .filter((c) => c.t < timeline.duration)
    .map((c) => ({ ...c, t: round(c.t) }));
}

/** Seconds the music fades out over at the end of the ad. */
export const FADE_OUT = 1.6;

const round = (n: number) => Math.round(n * 1000) / 1000;
