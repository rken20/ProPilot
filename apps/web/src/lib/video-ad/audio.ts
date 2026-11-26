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
  type MusicShape,
  type Note,
} from "./sound";

export const SAMPLE_RATE = 48_000;

export type SoundPlan = {
  /** The video's tempo and shape; the built-in music is written to it. */
  shape: MusicShape;
  /** One of our tracks, or none. */
  music: MusicId | null;
  cues: Cue[];
  effects: boolean;
};

/** Where a sound goes: straight out, and into the room (the reverb). */
type Bus = { dry: AudioNode; room: AudioNode };

/** Render the soundtrack, or null when there is nothing to hear. */
export async function renderSoundtrack(
  plan: SoundPlan,
): Promise<AudioBuffer | null> {
  if (!plan.music && (!plan.effects || plan.cues.length === 0)) return null;
  if (typeof OfflineAudioContext === "undefined") return null;
  const { duration } = plan.shape;
  const length = Math.max(1, Math.ceil(duration * SAMPLE_RATE));
  const ctx = new OfflineAudioContext(2, length, SAMPLE_RATE);

  // Everything goes through a gentle limiter, so stacked sounds never clip.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  const master = ctx.createGain();
  master.gain.value = 0.92;
  limiter.connect(master).connect(ctx.destination);

  // One room for the music and the effects: it is what makes separate synthesised sounds sit together.
  const room = ctx.createConvolver();
  room.buffer = roomBuffer(ctx);
  const roomLevel = ctx.createGain();
  roomLevel.gain.value = 0.5;
  room.connect(roomLevel).connect(limiter);

  const noise = noiseBuffer(ctx);
  if (plan.music) {
    const out = ctx.createGain();
    out.connect(limiter);
    const level = 0.62;
    // Fade in briefly, then out at the end so the ad never stops mid-note.
    out.gain.setValueAtTime(0, 0);
    out.gain.linearRampToValueAtTime(level, 0.08);
    out.gain.setValueAtTime(level, Math.max(0.1, duration - FADE_OUT));
    out.gain.linearRampToValueAtTime(0, duration);
    const send = ctx.createGain();
    send.gain.value = 0.55;
    send.connect(room);
    // The chords and bass dip under every kick and swell back: the "pump" that makes a beat feel like a record.
    const pumped = ctx.createGain();
    pumped.connect(out);
    const notes = musicNotes(plan.music, plan.shape);
    const beat = 60 / plan.shape.bpm;
    pumped.gain.setValueAtTime(1, 0);
    for (const n of notes) {
      if (n.voice !== "kick") continue;
      pumped.gain.setValueAtTime(1, n.t);
      pumped.gain.linearRampToValueAtTime(1 - 0.5 * n.vel, n.t + 0.012);
      pumped.gain.linearRampToValueAtTime(1, n.t + Math.min(0.3, beat * 0.55));
    }
    const drums: Bus = { dry: out, room: send };
    const tones: Bus = { dry: pumped, room: send };
    for (const note of notes)
      play(ctx, DRUMS.has(note.voice) ? drums : tones, noise, note);
  }
  if (plan.effects) {
    const out = ctx.createGain();
    out.gain.value = 0.7;
    out.connect(limiter);
    const send = ctx.createGain();
    send.gain.value = 0.3;
    send.connect(room);
    for (const cue of plan.cues)
      effect(ctx, { dry: out, room: send }, noise, cue);
  }
  return ctx.startRendering();
}

// ------------------------------------------------------------------ instruments

type Ctx = BaseAudioContext;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const DRUMS = new Set<Note["voice"]>([
  "kick",
  "snare",
  "clap",
  "rim",
  "hat",
  "open",
  "crash",
]);

/** A seeded run of random numbers, so every render of the same ad sounds the same. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/** Two seconds of white noise for drums and whooshes. */
function noiseBuffer(ctx: Ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const next = random(1234567);
  for (let i = 0; i < data.length; i++) data[i] = next();
  return buf;
}

/** The sound of a medium room: noise that dies away over a second and a half, a little different in each ear. */
function roomBuffer(ctx: Ctx) {
  const seconds = 1.5;
  const buf = ctx.createBuffer(
    2,
    Math.floor(ctx.sampleRate * seconds),
    ctx.sampleRate,
  );
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    const next = random(777 + c * 9001);
    for (let i = 0; i < data.length; i++) {
      // Nothing for the first few milliseconds, then a dense tail.
      data[i] = i < 400 ? 0 : next() * Math.pow(1 - i / data.length, 3.2);
    }
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

/** A gain that rises to `peak` in `attack` seconds and dies away over `decay`, sent to the bus with `wet` of it going to the room. */
function pluck(
  ctx: Ctx,
  bus: Bus,
  t: number,
  peak: number,
  attack: number,
  decay: number,
  wet = 0,
) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(bus.dry);
  if (wet > 0) {
    const w = ctx.createGain();
    w.gain.value = wet;
    g.connect(w).connect(bus.room);
  }
  return g;
}

/** Place a sound a little to the left or right. */
function panned(ctx: Ctx, out: AudioNode, pan: number) {
  if (typeof ctx.createStereoPanner !== "function") return out;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(out);
  return p;
}

function play(ctx: Ctx, bus: Bus, noise: AudioBuffer, n: Note) {
  const f = hz(n.midi);
  switch (n.voice) {
    case "pad": {
      // Warm and wide: three detuned saws under a filter that opens slowly.
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(500, n.t);
      lp.frequency.linearRampToValueAtTime(1500, n.t + Math.min(1.2, n.dur));
      const g = ctx.createGain();
      const attack = Math.min(0.3, n.dur / 3);
      const end = n.t + n.dur;
      g.gain.setValueAtTime(0, n.t);
      g.gain.linearRampToValueAtTime(n.vel * 0.06, n.t + attack);
      g.gain.setValueAtTime(n.vel * 0.06, Math.max(n.t + attack, end - 0.25));
      g.gain.linearRampToValueAtTime(0, end);
      lp.connect(g);
      g.connect(bus.dry);
      const w = ctx.createGain();
      w.gain.value = 0.6;
      g.connect(w).connect(bus.room);
      [-9, 0, 9].forEach((d, i) =>
        osc(
          ctx,
          "sawtooth",
          f,
          n.t,
          end + 0.02,
          panned(ctx, lp, (i - 1) * 0.5),
          d,
        ),
      );
      break;
    }
    case "keys": {
      // An electric-piano tone: a soft body, a bright knock at the start.
      const decay = Math.min(Math.max(n.dur * 1.6, 0.25), 1.6);
      const g = pluck(ctx, bus, n.t, n.vel * 0.2, 0.004, decay, 0.5);
      const pan = panned(ctx, g, ((n.midi % 5) - 2) * 0.18);
      osc(ctx, "triangle", f, n.t, n.t + decay + 0.05, pan);
      const h = ctx.createGain();
      h.gain.setValueAtTime(0.5, n.t);
      h.gain.exponentialRampToValueAtTime(0.02, n.t + 0.18);
      h.connect(pan);
      osc(ctx, "sine", f * 2, n.t, n.t + decay + 0.05, h);
      osc(ctx, "sine", f * 4, n.t, n.t + 0.2, h);
      break;
    }
    case "pluck": {
      // The lead: a saw through a filter that snaps shut, like a plucked synth string.
      const decay = Math.min(Math.max(n.dur * 1.4, 0.16), 0.7);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 4;
      lp.frequency.setValueAtTime(Math.min(9000, f * 9), n.t);
      lp.frequency.exponentialRampToValueAtTime(
        Math.max(300, f * 1.2),
        n.t + decay * 0.8,
      );
      const g = pluck(ctx, bus, n.t, n.vel * 0.17, 0.004, decay, 0.7);
      lp.connect(panned(ctx, g, ((n.midi % 4) - 1.5) * 0.25));
      osc(ctx, "sawtooth", f, n.t, n.t + decay + 0.05, lp, -6);
      osc(ctx, "square", f, n.t, n.t + decay + 0.05, lp, 6);
      break;
    }
    case "bell": {
      const g = pluck(ctx, bus, n.t, n.vel * 0.13, 0.005, 2.2, 0.9);
      osc(ctx, "sine", f, n.t, n.t + 2.3, g);
      const h = ctx.createGain();
      h.gain.value = 0.22;
      h.connect(g);
      osc(ctx, "sine", f * 2.76, n.t, n.t + 2.3, h);
      osc(ctx, "sine", f * 5.4, n.t, n.t + 0.4, h);
      break;
    }
    case "bass": {
      // A round low note with a little grit so it's heard on a phone speaker.
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(900, n.t);
      lp.frequency.exponentialRampToValueAtTime(
        260,
        n.t + Math.min(0.25, n.dur),
      );
      const g = ctx.createGain();
      const end = n.t + n.dur;
      g.gain.setValueAtTime(0, n.t);
      g.gain.linearRampToValueAtTime(n.vel * 0.26, n.t + 0.008);
      g.gain.setValueAtTime(n.vel * 0.26, Math.max(n.t + 0.01, end - 0.05));
      g.gain.linearRampToValueAtTime(0, end);
      lp.connect(g).connect(bus.dry);
      osc(ctx, "sawtooth", f, n.t, end + 0.02, lp);
      const sub = ctx.createGain();
      sub.gain.value = 0.7;
      sub.connect(g);
      osc(ctx, "sine", f, n.t, end + 0.02, sub);
      break;
    }
    case "kick": {
      const g = pluck(ctx, bus, n.t, n.vel * 0.95, 0.002, 0.32);
      const o = osc(ctx, "sine", 150, n.t, n.t + 0.4, g);
      o.frequency.setValueAtTime(150, n.t);
      o.frequency.exponentialRampToValueAtTime(48, n.t + 0.1);
      // The click that lets a kick cut through small speakers.
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2500;
      hp.connect(pluck(ctx, bus, n.t, n.vel * 0.12, 0.001, 0.015));
      noiseAt(ctx, noise, n.t, 0.03, hp);
      break;
    }
    case "snare": {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2000;
      bp.Q.value = 0.7;
      bp.connect(pluck(ctx, bus, n.t, n.vel * 0.34, 0.002, 0.14, 0.4));
      noiseAt(ctx, noise, n.t, 0.2, bp);
      osc(
        ctx,
        "sine",
        200,
        n.t,
        n.t + 0.1,
        pluck(ctx, bus, n.t, n.vel * 0.18, 0.002, 0.07),
      );
      break;
    }
    case "clap": {
      // Several hands a few milliseconds apart, then the room.
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1300;
      bp.Q.value = 1.1;
      [0, 0.011, 0.022].forEach((d) =>
        bp.connect(
          pluck(
            ctx,
            bus,
            n.t + d,
            n.vel * 0.3,
            0.001,
            d === 0.022 ? 0.16 : 0.012,
            0.6,
          ),
        ),
      );
      noiseAt(ctx, noise, n.t, 0.25, bp);
      break;
    }
    case "rim": {
      osc(
        ctx,
        "triangle",
        820,
        n.t,
        n.t + 0.05,
        pluck(ctx, bus, n.t, n.vel * 0.25, 0.001, 0.035, 0.6),
      );
      osc(
        ctx,
        "sine",
        1700,
        n.t,
        n.t + 0.03,
        pluck(ctx, bus, n.t, n.vel * 0.1, 0.001, 0.02, 0.6),
      );
      break;
    }
    case "hat":
    case "open": {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = n.voice === "open" ? 6000 : 7500;
      const decay = n.voice === "open" ? Math.max(0.09, n.dur) : 0.04;
      hp.connect(
        panned(
          ctx,
          pluck(ctx, bus, n.t, n.vel * 0.16, 0.001, decay, 0.15),
          n.voice === "open" ? 0.25 : -0.2,
        ),
      );
      noiseAt(ctx, noise, n.t, decay + 0.03, hp);
      break;
    }
    case "crash": {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 3500;
      hp.connect(
        pluck(ctx, bus, n.t, n.vel * 0.3, 0.002, Math.max(0.8, n.dur), 0.7),
      );
      noiseAt(ctx, noise, n.t, Math.max(0.8, n.dur) + 0.05, hp);
      break;
    }
  }
}

// ------------------------------------------------------------------ effects

/** Shaped noise between two moments: the air of a whoosh, a swish or a riser. */
function air(
  ctx: Ctx,
  bus: Bus,
  noise: AudioBuffer,
  o: {
    from: number;
    peak: number;
    end: number;
    type: BiquadFilterType;
    f0: number;
    f1: number;
    f2?: number;
    level: number;
    wet?: number;
  },
) {
  const filter = ctx.createBiquadFilter();
  filter.type = o.type;
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(o.f0, o.from);
  filter.frequency.exponentialRampToValueAtTime(o.f1, o.peak);
  if (o.f2 && o.end > o.peak)
    filter.frequency.exponentialRampToValueAtTime(o.f2, o.end);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, o.from);
  g.gain.exponentialRampToValueAtTime(
    o.level,
    Math.max(o.from + 0.01, o.peak - 0.005),
  );
  g.gain.exponentialRampToValueAtTime(0.0001, Math.max(o.peak + 0.01, o.end));
  filter.connect(g);
  g.connect(bus.dry);
  if (o.wet) {
    const w = ctx.createGain();
    w.gain.value = o.wet;
    g.connect(w).connect(bus.room);
  }
  noiseAt(ctx, noise, o.from, Math.max(o.peak, o.end) + 0.02 - o.from, filter);
}

function effect(
  ctx: Ctx,
  bus: Bus,
  noise: AudioBuffer,
  { t, effect: kind }: Cue,
) {
  switch (kind) {
    case "whoosh":
      // Air rushing past: it rises to the cut and falls away after it.
      air(ctx, bus, noise, {
        from: Math.max(0, t - 0.26),
        peak: t,
        end: t + 0.24,
        type: "bandpass",
        f0: 300,
        f1: 3600,
        f2: 1200,
        level: 0.3,
        wet: 0.5,
      });
      break;
    case "swish":
      // A lighter pass of air for a quick cut.
      air(ctx, bus, noise, {
        from: Math.max(0, t - 0.12),
        peak: t,
        end: t + 0.12,
        type: "bandpass",
        f0: 900,
        f1: 4200,
        level: 0.15,
        wet: 0.3,
      });
      break;
    case "pop": {
      const start = Math.max(0, t - 0.02);
      const o = osc(
        ctx,
        "sine",
        520,
        start,
        start + 0.16,
        pluck(ctx, bus, start, 0.36, 0.004, 0.12, 0.3),
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
        pluck(ctx, bus, t, 0.22, 0.002, 0.045, 0.3),
      );
      osc(
        ctx,
        "triangle",
        2400,
        t,
        t + 0.04,
        pluck(ctx, bus, t, 0.08, 0.001, 0.025),
      );
      break;
    case "chime":
      // C, E and G high up, one after another.
      [84, 88, 91].forEach((m, i) => {
        const at = t + i * 0.07;
        const g = pluck(ctx, bus, at, 0.17, 0.004, 1.6, 0.8);
        osc(ctx, "sine", hz(m), at, at + 1.7, g);
        const h = ctx.createGain();
        h.gain.value = 0.2;
        h.connect(g);
        osc(ctx, "sine", hz(m) * 2, at, at + 1.7, h);
      });
      break;
    case "riser":
      // Builds for a second and stops dead at the moment it leads to.
      air(ctx, bus, noise, {
        from: Math.max(0, t - 1.0),
        peak: t,
        end: t,
        type: "highpass",
        f0: 500,
        f1: 7000,
        level: 0.24,
        wet: 0.4,
      });
      break;
    case "hit": {
      const boom = osc(
        ctx,
        "sine",
        90,
        t,
        t + 0.9,
        pluck(ctx, bus, t, 0.8, 0.003, 0.8),
      );
      boom.frequency.setValueAtTime(90, t);
      boom.frequency.exponentialRampToValueAtTime(40, t + 0.5);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2000;
      lp.connect(pluck(ctx, bus, t, 0.35, 0.002, 0.3, 0.6));
      noiseAt(ctx, noise, t, 0.35, lp);
      [96, 100, 103].forEach((m) =>
        osc(
          ctx,
          "sine",
          hz(m),
          t,
          t + 1.3,
          pluck(ctx, bus, t, 0.05, 0.003, 1.2, 0.9),
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
