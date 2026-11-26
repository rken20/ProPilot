import { HERO_SEQUENCE, type HeroEffect } from "./hero-sequence";

/**
 * Sound for the home page's scroll opening: short effects made in the browser
 * (no audio files), played as the house is built.
 *
 * On by default (owner's decision, 26 Nov). Browsers only let a page make
 * sound after the visitor taps, clicks or presses a key, so until then the
 * sound is "waiting", and it starts at the first such touch anywhere on the
 * page. A visitor who turns it off is remembered on that device.
 */

export type HeroSoundState = "off" | "waiting" | "on";

const KEY = "mhs-hero-sound";
/** The inputs browsers accept as permission to play sound. Scrolling with a wheel is not one of them. */
const GESTURES = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "touchend",
  "keydown",
] as const;
const listeners = new Set<() => void>();
let on = true;
let read = false;
let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noise: AudioBuffer | null = null;

const notify = () => listeners.forEach((fn) => fn());

function listen(add: boolean) {
  for (const type of GESTURES) {
    if (add)
      window.addEventListener(type, onGesture, {
        capture: true,
        passive: true,
      });
    else window.removeEventListener(type, onGesture, { capture: true });
  }
}

function onGesture() {
  void unlock();
}

function remembered(): boolean {
  if (!read && typeof window !== "undefined") {
    read = true;
    try {
      on = window.localStorage.getItem(KEY) !== "0";
    } catch {
      // Private mode: the choice just isn't remembered.
    }
    if (on) listen(true);
  }
  return on;
}

/** Starts the sound, if it is on. Call only from a tap, click or key press. Resolves once it can play. */
async function unlock(): Promise<boolean> {
  if (!on || typeof window === "undefined") return false;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return false;
  if (!ctx) {
    ctx = new Ctor();
    out = ctx.createGain();
    out.gain.value = 0.5;
    // A gentle limiter, so several effects landing together don't crackle.
    const squash = ctx.createDynamicsCompressor();
    squash.threshold.value = -14;
    squash.ratio.value = 6;
    out.connect(squash).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    ctx.onstatechange = () => {
      if (ctx?.state === "running") listen(false);
      notify();
    };
  }
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  const running = ctx.state === "running";
  if (running) listen(false);
  return running;
}

function current(): HeroSoundState {
  if (!remembered()) return "off";
  return ctx?.state === "running" ? "on" : "waiting";
}

/** For `useSyncExternalStore`: off, waiting for the visitor's first tap, or on. */
export const heroSound = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  state: current,
  stateOnServer: (): HeroSoundState => "waiting",
  /** Call from the click itself, so the browser lets the sound start. */
  set(next: boolean) {
    remembered();
    on = next;
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // Not remembered; still works for this visit.
    }
    if (next) {
      void unlock().then((ok) => {
        if (ok) play("pop", 1);
        notify();
      });
    } else {
      listen(false);
    }
    notify();
  },
};

type Tone = {
  type?: OscillatorType;
  from: number;
  to?: number;
  at?: number;
  len: number;
  gain: number;
};
type Hiss = {
  filter: BiquadFilterType;
  from: number;
  to?: number;
  q?: number;
  at?: number;
  len: number;
  gain: number;
  swell?: boolean;
};

/** Each effect is a few tones and filtered noise bursts. Times in seconds. */
const RECIPES: Record<HeroEffect, { tones?: Tone[]; hiss?: Hiss[] }> = {
  // A part dropping onto the slab.
  thud: {
    tones: [{ from: 130, to: 52, len: 0.2, gain: 0.9 }],
    hiss: [{ filter: "lowpass", from: 900, len: 0.05, gain: 0.35 }],
  },
  // A wall panel locking in.
  clack: {
    tones: [{ type: "triangle", from: 340, to: 210, len: 0.07, gain: 0.4 }],
    hiss: [{ filter: "bandpass", from: 2100, q: 1.4, len: 0.045, gain: 0.5 }],
  },
  // The roof settling: heavier, with a little air.
  roof: {
    tones: [
      { from: 96, to: 40, len: 0.36, gain: 1 },
      { type: "triangle", from: 220, to: 150, len: 0.09, gain: 0.25 },
    ],
    hiss: [{ filter: "lowpass", from: 1400, to: 300, len: 0.22, gain: 0.3 }],
  },
  // Doors, windows, hedges and trees popping in.
  pop: { tones: [{ from: 420, to: 880, len: 0.085, gain: 0.5 }] },
  // Path stones.
  tick: {
    tones: [{ type: "triangle", from: 1500, to: 1100, len: 0.03, gain: 0.3 }],
    hiss: [{ filter: "highpass", from: 3000, len: 0.02, gain: 0.2 }],
  },
  // The house gliding across the screen.
  whoosh: {
    hiss: [
      {
        filter: "bandpass",
        from: 380,
        to: 1700,
        q: 0.8,
        len: 0.5,
        gain: 0.34,
        swell: true,
      },
    ],
  },
  // The windows lighting up.
  chime: {
    tones: [
      { from: 1046.5, len: 1.5, gain: 0.3 },
      { from: 1318.5, at: 0.09, len: 1.5, gain: 0.26 },
      { from: 1568, at: 0.18, len: 1.7, gain: 0.24 },
      { from: 2093, at: 0.27, len: 1.9, gain: 0.16 },
    ],
  },
};

function play(effect: HeroEffect, level: number) {
  if (!on || !ctx || !out || ctx.state !== "running") return;
  const t0 = ctx.currentTime + 0.01;
  const recipe = RECIPES[effect];
  for (const tone of recipe.tones ?? []) {
    const t = t0 + (tone.at ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type ?? "sine";
    osc.frequency.setValueAtTime(tone.from, t);
    if (tone.to)
      osc.frequency.exponentialRampToValueAtTime(tone.to, t + tone.len);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(tone.gain * level, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.len);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + tone.len + 0.03);
  }
  for (const hiss of recipe.hiss ?? []) {
    if (!noise) break;
    const t = t0 + (hiss.at ?? 0);
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = noise;
    filter.type = hiss.filter;
    filter.Q.value = hiss.q ?? 0.7;
    filter.frequency.setValueAtTime(hiss.from, t);
    if (hiss.to)
      filter.frequency.exponentialRampToValueAtTime(hiss.to, t + hiss.len);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(
      hiss.gain * level,
      t + (hiss.swell ? hiss.len * 0.45 : 0.004),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, t + hiss.len);
    src.connect(filter).connect(gain).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + hiss.len + 0.03);
  }
}

/**
 * The effects to play when the build moves from `prev` to `now` (both 0 to 1).
 * Forward plays each part's own sound; backward plays a quiet tick as a part
 * lifts off. A big jump keeps only the last few, so a fast flick isn't a burst.
 */
export function cuesBetween(
  prev: number,
  now: number,
  max = 3,
): Array<{ effect: HeroEffect; level: number }> {
  if (prev === now) return [];
  const forward = now > prev;
  const [lo, hi] = forward ? [prev, now] : [now, prev];
  const crossed = HERO_SEQUENCE.cues.filter((c) => c.at > lo && c.at <= hi);
  const kept = forward ? crossed.slice(-max) : crossed.slice(0, max);
  return kept.map((c) =>
    forward
      ? { effect: c.effect, level: 1 }
      : { effect: "tick" as const, level: 0.6 },
  );
}

/** Called on every frame of the scroll: plays whatever the build just passed. */
export function soundBuild(prev: number, now: number) {
  if (!on || !ctx) return;
  for (const c of cuesBetween(prev, now)) play(c.effect, c.level);
}

/** The house starts across the screen. */
export function soundGlide() {
  play("whoosh", 1);
}
