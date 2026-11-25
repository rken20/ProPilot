/**
 * Makes a video ad's soundtrack in the browser: the music track and the sound
 * effects from `sound.ts`, played on synthesised instruments into an offline
 * audio context, or the owner's own music file. Nothing is uploaded.
 */
import {
  FADE_OUT,
  musicNotes,
  type Cue,
  type MusicId,
  type Note,
} from "./sound";

export const SAMPLE_RATE = 48_000;

export type SoundPlan = {
  duration: number;
  /** One of ours, the owner's own decoded file, or none. */
  music: MusicId | AudioBuffer | null;
  cues: Cue[];
  effects: boolean;
};

/** Render the soundtrack, or null when there is nothing to hear. */
export async function renderSoundtrack(
  plan: SoundPlan,
): Promise<AudioBuffer | null> {
  if (!plan.music && (!plan.effects || plan.cues.length === 0)) return null;
  if (typeof OfflineAudioContext === "undefined") return null;
  const length = Math.max(1, Math.ceil(plan.duration * SAMPLE_RATE));
  const ctx = new OfflineAudioContext(2, length, SAMPLE_RATE);

  // Everything goes through a gentle limiter, so stacked sounds never clip.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  limiter.connect(master).connect(ctx.destination);

  const noise = noiseBuffer(ctx);
  if (plan.music) {
    const bus = ctx.createGain();
    bus.connect(limiter);
    const level = typeof plan.music === "string" ? 0.6 : 0.75;
    // Fade in briefly, then out at the end so the ad never stops mid-note.
    bus.gain.setValueAtTime(0, 0);
    bus.gain.linearRampToValueAtTime(level, 0.15);
    bus.gain.setValueAtTime(level, Math.max(0.2, plan.duration - FADE_OUT));
    bus.gain.linearRampToValueAtTime(0, plan.duration);
    if (typeof plan.music === "string") {
      for (const note of musicNotes(plan.music, plan.duration))
        play(ctx, bus, noise, note);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = plan.music;
      src.loop = plan.music.duration < plan.duration;
      src.connect(bus);
      src.start(0);
    }
  }
  if (plan.effects) {
    const bus = ctx.createGain();
    bus.gain.value = 0.8;
    bus.connect(limiter);
    for (const cue of plan.cues) effect(ctx, bus, noise, cue);
  }
  return ctx.startRendering();
}

/** Read a music file the owner picked. Throws if the browser can't read it. */
export async function decodeMusic(file: File): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  return ctx.decodeAudioData(await file.arrayBuffer());
}

// ------------------------------------------------------------------ instruments

type Ctx = BaseAudioContext;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Two seconds of white noise for drums and whooshes. Seeded, so every render sounds the same. */
function noiseBuffer(ctx: Ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return buf;
}

function osc(
  ctx: Ctx,
  type: OscillatorType,
  freq: number,
  t: number,
  stop: number,
  out: AudioNode,
  detune = 0,
) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  o.connect(out);
  o.start(t);
  o.stop(stop);
  return o;
}

function noiseAt(
  ctx: Ctx,
  noise: AudioBuffer,
  t: number,
  length: number,
  out: AudioNode,
) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  src.connect(out);
  src.start(t, (t * 7.3) % 1.5);
  src.stop(t + length);
}

/** A gain that rises to `peak` in `attack` seconds and dies away over `decay`. */
function pluck(
  ctx: Ctx,
  out: AudioNode,
  t: number,
  peak: number,
  attack: number,
  decay: number,
) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function play(ctx: Ctx, out: AudioNode, noise: AudioBuffer, n: Note) {
  const f = hz(n.midi);
  switch (n.voice) {
    case "pad": {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      const g = ctx.createGain();
      const attack = Math.min(0.35, n.dur / 3);
      g.gain.setValueAtTime(0, n.t);
      g.gain.linearRampToValueAtTime(n.vel * 0.07, n.t + attack);
      g.gain.setValueAtTime(n.vel * 0.07, n.t + n.dur);
      g.gain.linearRampToValueAtTime(0, n.t + n.dur + 0.6);
      lp.connect(g).connect(out);
      osc(ctx, "sawtooth", f, n.t, n.t + n.dur + 0.7, lp, -7);
      osc(ctx, "sawtooth", f, n.t, n.t + n.dur + 0.7, lp, 7);
      break;
    }
    case "keys": {
      const decay = Math.min(n.dur * 1.5, 1.2);
      const g = pluck(ctx, out, n.t, n.vel * 0.16, 0.005, decay);
      osc(ctx, "triangle", f, n.t, n.t + decay + 0.05, g);
      const h = ctx.createGain();
      h.gain.value = 0.3;
      h.connect(g);
      osc(ctx, "sine", f * 2, n.t, n.t + decay + 0.05, h);
      break;
    }
    case "bell": {
      const g = pluck(ctx, out, n.t, n.vel * 0.12, 0.005, 2.5);
      osc(ctx, "sine", f, n.t, n.t + 2.6, g);
      const h = ctx.createGain();
      h.gain.value = 0.25;
      h.connect(g);
      osc(ctx, "sine", f * 2.76, n.t, n.t + 2.6, h);
      break;
    }
    case "bass": {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, n.t);
      g.gain.linearRampToValueAtTime(n.vel * 0.3, n.t + 0.01);
      g.gain.setValueAtTime(n.vel * 0.3, n.t + Math.max(0.02, n.dur - 0.08));
      g.gain.linearRampToValueAtTime(0, n.t + n.dur);
      lp.connect(g).connect(out);
      osc(ctx, "triangle", f, n.t, n.t + n.dur + 0.02, lp);
      break;
    }
    case "kick": {
      const g = pluck(ctx, out, n.t, n.vel * 0.9, 0.003, 0.35);
      const o = osc(ctx, "sine", 140, n.t, n.t + 0.4, g);
      o.frequency.setValueAtTime(140, n.t);
      o.frequency.exponentialRampToValueAtTime(45, n.t + 0.12);
      break;
    }
    case "snare": {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800;
      bp.Q.value = 0.8;
      bp.connect(pluck(ctx, out, n.t, n.vel * 0.35, 0.002, 0.18));
      noiseAt(ctx, noise, n.t, 0.22, bp);
      osc(
        ctx,
        "sine",
        190,
        n.t,
        n.t + 0.1,
        pluck(ctx, out, n.t, n.vel * 0.2, 0.002, 0.08),
      );
      break;
    }
    case "hat": {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      hp.connect(pluck(ctx, out, n.t, n.vel * 0.15, 0.001, 0.05));
      noiseAt(ctx, noise, n.t, 0.07, hp);
      break;
    }
  }
}

// ------------------------------------------------------------------ effects

function effect(
  ctx: Ctx,
  out: AudioNode,
  noise: AudioBuffer,
  { t, effect: kind }: Cue,
) {
  switch (kind) {
    case "whoosh": {
      // Air rushing past: filtered noise that rises to the cut and falls away after it.
      const from = Math.max(0, t - 0.3);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(300, from);
      bp.frequency.exponentialRampToValueAtTime(3500, t);
      bp.frequency.exponentialRampToValueAtTime(1200, t + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, from);
      g.gain.exponentialRampToValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      bp.connect(g).connect(out);
      noiseAt(ctx, noise, from, t + 0.3 - from, bp);
      break;
    }
    case "pop": {
      const start = Math.max(0, t - 0.02);
      const o = osc(
        ctx,
        "sine",
        520,
        start,
        start + 0.16,
        pluck(ctx, out, start, 0.38, 0.004, 0.12),
      );
      o.frequency.setValueAtTime(520, start);
      o.frequency.exponentialRampToValueAtTime(880, start + 0.06);
      break;
    }
    case "tick":
      osc(
        ctx,
        "sine",
        1600,
        t,
        t + 0.06,
        pluck(ctx, out, t, 0.22, 0.002, 0.045),
      );
      osc(
        ctx,
        "triangle",
        2400,
        t,
        t + 0.04,
        pluck(ctx, out, t, 0.08, 0.001, 0.025),
      );
      break;
    case "chime":
      // C, E and G high up, one after another.
      [84, 88, 91].forEach((m, i) => {
        const at = t + i * 0.07;
        const g = pluck(ctx, out, at, 0.16, 0.004, 1.6);
        osc(ctx, "sine", hz(m), at, at + 1.7, g);
        const h = ctx.createGain();
        h.gain.value = 0.2;
        h.connect(g);
        osc(ctx, "sine", hz(m) * 2, at, at + 1.7, h);
      });
      break;
    case "riser": {
      const from = Math.max(0, t - 1.2);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.setValueAtTime(400, from);
      hp.frequency.exponentialRampToValueAtTime(6000, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, from);
      g.gain.exponentialRampToValueAtTime(0.28, t - 0.02);
      g.gain.linearRampToValueAtTime(0, t);
      hp.connect(g).connect(out);
      noiseAt(ctx, noise, from, t - from, hp);
      break;
    }
    case "hit": {
      const boom = osc(
        ctx,
        "sine",
        90,
        t,
        t + 0.9,
        pluck(ctx, out, t, 0.8, 0.003, 0.8),
      );
      boom.frequency.setValueAtTime(90, t);
      boom.frequency.exponentialRampToValueAtTime(40, t + 0.5);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2000;
      lp.connect(pluck(ctx, out, t, 0.35, 0.002, 0.3));
      noiseAt(ctx, noise, t, 0.35, lp);
      [96, 100, 103].forEach((m) =>
        osc(
          ctx,
          "sine",
          hz(m),
          t,
          t + 1.3,
          pluck(ctx, out, t, 0.05, 0.003, 1.2),
        ),
      );
      break;
    }
  }
}

// ------------------------------------------------------------------ preview

/**
 * Plays a rendered soundtrack along with the preview, on a loop. The preview's
 * picture follows `time()` while it plays, so sound and picture stay together.
 */
export class PreviewSound {
  private ctx: AudioContext | null = null;
  private src: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private startedAt = 0;
  private offset = 0;
  private length = 0;

  /** Must first be called from a tap or click: browsers only allow sound after one. */
  async unlock() {
    if (typeof AudioContext === "undefined") return false;
    this.ctx ??= new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {});
    return this.ctx.state === "running";
  }

  play(buffer: AudioBuffer, from: number) {
    this.stop();
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.ctx.destination);
    this.length = buffer.duration;
    this.offset = ((from % this.length) + this.length) % this.length;
    this.startedAt = this.ctx.currentTime;
    src.start(0, this.offset);
    this.src = src;
    this.buffer = buffer;
  }

  /** Jump to `t` seconds into the ad, if the sound is playing. */
  seek(t: number) {
    if (this.src && this.buffer) this.play(this.buffer, t);
  }

  stop() {
    try {
      this.src?.stop();
    } catch {
      // Already stopped.
    }
    this.src?.disconnect();
    this.src = null;
  }

  /** Where the sound is now, in seconds into the ad, or null when it isn't playing. */
  time(): number | null {
    if (!this.src || !this.ctx || !this.length) return null;
    return (this.offset + this.ctx.currentTime - this.startedAt) % this.length;
  }

  close() {
    this.stop();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
