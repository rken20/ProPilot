/**
 * The Video Ad Maker's sound, as plain data: which music track plays, the notes
 * it plays, and when the sound effects land. No audio code here, so it can be
 * unit-tested; `audio.ts` turns this into sound in the browser.
 *
 * The music is written here, note by note, so it is ours to use anywhere: no
 * licence, no song that Facebook or TikTok could mute. It is played at the
 * video's own tempo and follows its shape: a light intro under the headline,
 * the full beat from the first cut, and an ending that lands on the closing
 * card. Every cut in the video falls on a beat of it.
 */
import { CAPTION_AT, PRICE_AT, type TemplateId, type Timeline } from "./spec";

export const MUSIC = {
  calm: {
    label: "Calm",
    about: [
      "Soft keys over an easy beat.",
      "Malambot na keys sa relaxed na beat.",
    ],
  },
  bright: {
    label: "Bright",
    about: [
      "Upbeat pop with claps and a hook.",
      "Masiglang pop na may claps at hook.",
    ],
  },
  luxe: {
    label: "Luxe",
    about: [
      "Slow, warm chords for premium homes.",
      "Mabagal at mainit na chords para sa premium homes.",
    ],
  },
  pulse: {
    label: "Pulse",
    about: ["Driving house beat.", "House beat na tuloy-tuloy."],
  },
} as const satisfies Record<
  string,
  { label: string; about: readonly [string, string] }
>;
export type MusicId = keyof typeof MUSIC;
export const MUSIC_IDS = Object.keys(MUSIC) as MusicId[];

/** The track that goes with each template when the AI hasn't chosen one. */
export const MUSIC_FOR: Record<TemplateId, MusicId> = {
  showcase: "bright",
  bold: "pulse",
  elegant: "luxe",
  facts: "calm",
  reveal: "pulse",
  reasons: "bright",
};

/** The AI's music choice if it named one of our tracks, else the template's own. */
export const musicChoice = (raw: unknown, template: TemplateId): MusicId =>
  MUSIC_IDS.includes(raw as MusicId) ? (raw as MusicId) : MUSIC_FOR[template];

export type Voice =
  | "pad"
  | "keys"
  | "pluck"
  | "bell"
  | "bass"
  | "kick"
  | "snare"
  | "clap"
  | "rim"
  | "hat"
  | "open"
  | "crash";
/** One note. `midi` is the pitch (60 is middle C); drums ignore it. `vel` is 0 to 1. */
export type Note = {
  t: number;
  voice: Voice;
  midi: number;
  dur: number;
  vel: number;
};

/** The video's shape, as the music needs it: its tempo, where the first cut is (the beat comes in) and where the closing card starts (the music lands). */
export type MusicShape = {
  bpm: number;
  duration: number;
  drop: number;
  outro: number;
};
export const musicShape = (tl: Timeline): MusicShape => ({
  bpm: tl.bpm,
  duration: tl.duration,
  drop: tl.scenes[1]?.start ?? 0,
  outro: tl.scenes[tl.scenes.length - 1]?.start ?? tl.duration,
});

/** Chords as MIDI notes, one per bar. */
const C = [48, 52, 55];
const G = [43, 47, 50];
const Am = [45, 48, 52];
const F = [41, 45, 48];
const Cmaj7 = [48, 52, 55, 59];
const Am9 = [45, 48, 52, 59];
const Fmaj7 = [41, 45, 48, 52];
const G6 = [43, 47, 50, 52];

const PROGRESSIONS: Record<MusicId, number[][]> = {
  calm: [C, Am, F, G],
  bright: [C, G, Am, F],
  luxe: [Cmaj7, Am9, Fmaj7, G6],
  pulse: [Am, F, C, G],
};

/** The tune each bar plays, as steps up the chord (0 is its lowest note, 3 the lowest again an octave up; null is a rest), one per eighth note. */
const TUNES: Record<MusicId, Array<Array<number | null>>> = {
  calm: [[2, null, 1, null, 3, null, 2, null]],
  bright: [
    [3, null, 2, 3, null, 1, 2, null],
    [3, null, 2, 3, null, 4, 3, null],
  ],
  luxe: [[null, null, 3, null, null, null, 2, null]],
  pulse: [
    [0, 2, 1, 2, 3, 2, 1, 2],
    [0, 2, 1, 2, 4, 2, 1, 2],
  ],
};

const step = (chord: number[], k: number) =>
  chord[k % chord.length]! + 12 * Math.floor(k / chord.length);

/**
 * Every note of a track for a video of the given shape. Nothing starts after
 * the end or rings past it, and the same shape always gives the same notes.
 */
export function musicNotes(track: MusicId, shape: MusicShape): Note[] {
  const { duration } = shape;
  const beat = 60 / shape.bpm;
  const chords = PROGRESSIONS[track];
  const tunes = TUNES[track];
  const notes: Note[] = [];
  const add = (
    t: number,
    voice: Voice,
    midi: number,
    dur: number,
    vel: number,
  ) => {
    const at = round(t);
    if (at >= 0 && at < duration - 0.05)
      notes.push({
        t: at,
        voice,
        midi,
        dur: Math.max(
          0.001,
          Math.floor(Math.min(dur, duration - at) * 1000) / 1000,
        ),
        vel: Math.min(1, vel),
      });
  };
  const beats = Math.ceil(duration / beat);
  let landed = false;
  for (let b = 0; b < beats; b++) {
    const at = b * beat;
    const inBar = b % 4;
    const bar = Math.floor(b / 4);
    const chord = chords[bar % chords.length]!;
    const root = chord[0]!;
    const tune = tunes[bar % tunes.length]!;
    const part =
      at >= shape.outro - 0.01
        ? "outro"
        : at >= shape.drop - 0.01
          ? "main"
          : "intro";
    const eighth = (k: number) => tune[(inBar * 2 + k) % tune.length] ?? null;

    if (part === "outro") {
      // The landing: a crash and a long chord on the closing card, then a slow fall of single notes.
      if (!landed) {
        landed = true;
        add(
          at,
          "crash",
          0,
          2.2,
          track === "luxe" || track === "calm" ? 0.45 : 0.7,
        );
        add(at, "kick", 0, 0.4, 0.95);
        chord.forEach((m) => add(at, "pad", m + 12, duration - at, 0.42));
        add(at, "bass", root - 12, Math.min(duration - at, beat * 6), 0.6);
      }
      const k = [3, 2, 1, 2][inBar]!;
      add(
        at,
        track === "luxe" ? "bell" : "keys",
        step(chord, k) + 24,
        beat * 2,
        0.4,
      );
      if (track === "bright" || track === "pulse")
        add(at + beat / 2, "hat", 0, 0.05, 0.2);
      continue;
    }

    if (inBar === 0 || b === 0)
      chord.forEach((m) =>
        add(
          at,
          "pad",
          m + 12,
          beat * (4 - inBar),
          part === "intro" ? 0.4 : 0.28,
        ),
      );
    const quiet = part === "intro";
    switch (track) {
      case "bright":
        if (quiet) {
          add(at + beat / 2, "hat", 0, 0.05, 0.25);
          chord.forEach((m) =>
            add(at + beat / 2, "keys", m + 24, beat / 3, 0.28),
          );
        } else {
          add(at, "kick", 0, 0.3, 0.95);
          if (inBar % 2 === 1) add(at, "clap", 0, 0.2, 0.7);
          add(at + beat / 2, "open", 0, 0.12, 0.3);
          add(at + beat / 4, "hat", 0, 0.04, 0.14);
          add(at + (beat * 3) / 4, "hat", 0, 0.04, 0.14);
          add(at, "bass", root - 12, beat / 2, 0.62);
          add(
            at + beat / 2,
            "bass",
            root + (inBar === 3 ? -5 : 0),
            beat / 2,
            0.5,
          );
          chord.forEach((m) =>
            add(at + beat / 2, "keys", m + 24, beat / 3, 0.26),
          );
        }
        for (const k of [0, 1]) {
          const n = eighth(k);
          if (n !== null)
            add(
              at + (k * beat) / 2,
              "pluck",
              step(chord, n) + 24,
              beat * 0.45,
              quiet ? 0.3 : 0.5,
            );
        }
        break;
      case "pulse":
        if (quiet) add(at + beat / 2, "hat", 0, 0.05, 0.22);
        else {
          add(at, "kick", 0, 0.3, 1);
          if (inBar % 2 === 1) add(at, "clap", 0, 0.2, 0.55);
          add(at + beat / 2, "open", 0, 0.14, 0.36);
          add(at + beat / 4, "hat", 0, 0.04, 0.12);
          add(at + (beat * 3) / 4, "hat", 0, 0.04, 0.16);
          // Off the beat, where the kick leaves room.
          add(at + beat / 2, "bass", root - 12, beat * 0.4, 0.7);
          if (inBar === 3)
            add(at + (beat * 3) / 4, "bass", root - 12, beat * 0.22, 0.5);
        }
        for (const k of [0, 1]) {
          const n = eighth(k);
          if (n !== null)
            add(
              at + (k * beat) / 2,
              "pluck",
              step(chord, n) + 24,
              beat * 0.4,
              quiet ? 0.26 : 0.42,
            );
        }
        break;
      case "calm":
        if (!quiet) {
          if (inBar % 2 === 0) add(at, "kick", 0, 0.3, 0.6);
          else add(at, "rim", 0, 0.08, 0.4);
          add(at + beat / 2, "hat", 0, 0.04, 0.16);
          if (inBar === 0) add(at, "bass", root - 12, beat * 2.5, 0.5);
          if (inBar === 2)
            add(at + beat / 2, "bass", root - 12, beat * 1.4, 0.42);
        }
        // A broken chord on the eighth notes, up and back.
        for (const k of [0, 1])
          add(
            at + (k * beat) / 2,
            "keys",
            step(chord, [0, 1, 2, 1, 3, 2, 1, 2][inBar * 2 + k]!) + 24,
            beat,
            k ? 0.3 : 0.44,
          );
        for (const k of [0, 1]) {
          const n = eighth(k);
          if (n !== null && !quiet)
            add(
              at + (k * beat) / 2,
              "bell",
              step(chord, n) + 36,
              beat * 2,
              0.22,
            );
        }
        break;
      case "luxe":
        if (!quiet) {
          if (inBar === 0) add(at, "kick", 0, 0.4, 0.7);
          if (inBar === 2) add(at, "rim", 0, 0.08, 0.3);
          add(at + beat / 2, "hat", 0, 0.04, 0.12);
          if (inBar === 0) add(at, "bass", root - 12, beat * 4, 0.5);
        }
        add(
          at,
          "keys",
          step(chord, [0, 2, 1, 2][inBar]!) + 24,
          beat * 1.5,
          quiet ? 0.3 : 0.4,
        );
        for (const k of [0, 1]) {
          const n = eighth(k);
          if (n !== null)
            add(
              at + (k * beat) / 2,
              "bell",
              step(chord, n) + 24,
              beat * 3,
              0.28,
            );
        }
        break;
    }
    // A short roll into the first cut, so the beat arrives with it.
    if (
      quiet &&
      at + beat >= shape.drop - 0.01 &&
      track !== "luxe" &&
      track !== "calm"
    ) {
      for (let k = 0; k < 4; k++)
        add(at + (k * beat) / 4, "snare", 0, 0.1, 0.25 + k * 0.12);
    }
  }
  return notes.sort((a, b) => a.t - b.t);
}

export type Effect =
  "whoosh" | "swish" | "pop" | "tick" | "chime" | "riser" | "hit";
/** A sound effect, with `t` the moment it should be heard most (a whoosh peaks at the cut, a riser ends there). */
export type Cue = { t: number; effect: Effect };

/**
 * Where the sound effects go: a whoosh on every cut (a lighter swish into a
 * quick clip), a pop as each caption comes in (a tick in the templates that
 * count or list facts), a rise into the closing card, and a chime as the price
 * lands. Price Reveal builds up to the price and hits on it. The times follow
 * the drawing code in `draw.ts`.
 */
export function soundCues(template: TemplateId, timeline: Timeline): Cue[] {
  const cues: Cue[] = [{ t: 0.1, effect: "pop" }];
  const lineSound: Effect =
    template === "facts" || template === "reasons" ? "tick" : "pop";
  for (const scene of timeline.scenes) {
    if (scene.kind === "intro") continue;
    if (scene.kind === "outro") {
      cues.push(
        { t: scene.start, effect: "riser" },
        { t: scene.start + timeline.cut / 2, effect: "whoosh" },
      );
      if (template === "reveal")
        cues.push(
          { t: scene.start + PRICE_AT.reveal, effect: "riser" },
          { t: scene.start + PRICE_AT.reveal, effect: "hit" },
        );
      else cues.push({ t: scene.start + PRICE_AT.normal, effect: "chime" });
      continue;
    }
    cues.push({
      t: scene.start + timeline.cut / 2,
      effect: scene.line ? "whoosh" : "swish",
    });
    if (scene.line)
      cues.push({
        t: scene.start + CAPTION_AT + (template === "reasons" ? 0.1 : 0.04),
        effect: lineSound,
      });
  }
  return cues
    .filter((c) => c.t < timeline.duration)
    .map((c) => ({ ...c, t: round(c.t) }))
    .sort((a, b) => a.t - b.t);
}

/** Seconds the music fades out over at the end of the ad. */
export const FADE_OUT = 1.2;

const round = (n: number) => Math.round(n * 1000) / 1000;
