"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { HERO_SEQUENCE as SEQ, framePath } from "./hero-sequence";
import { heroSound, soundBuild, soundGlide } from "./hero-sound";

/** Where the house sits on the stage, as fractions of it: centre x, centre y, width, height. */
type Box = [cx: number, cy: number, w: number, h: number];

/**
 * Three beats share the pinned stage. Each names when its words show (in scroll
 * progress, 0 to 1) and where the house sits meanwhile, wide and narrow.
 */
const BEATS: Array<{ from: number; to: number; wide: Box; narrow: Box }> = [
  {
    from: -1,
    to: 0.2,
    wide: [0.73, 0.54, 0.58, 0.92],
    narrow: [0.5, 0.75, 1.12, 0.48],
  },
  {
    from: 0.31,
    to: 0.62,
    wide: [0.29, 0.54, 0.56, 0.9],
    narrow: [0.5, 0.66, 1.08, 0.6],
  },
  {
    from: 0.73,
    to: 2,
    wide: [0.68, 0.5, 0.6, 0.94],
    narrow: [0.5, 0.68, 1.08, 0.52],
  },
];
const FADE = 0.07;

const LIVE =
  "(function(s){s.dataset.live=matchMedia('(prefers-reduced-motion: reduce)').matches?'still':'on'})(document.currentScript.parentElement)";

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (x: number) => x * x * (3 - 2 * x);

/** How visible a beat's words are at scroll progress `p`. */
function beatAlpha(i: number, p: number): number {
  const b = BEATS[i];
  return clamp((p - b.from) / FADE) * clamp((b.to - p) / FADE);
}

/** The house's box at progress `p`: it holds during a beat and glides between beats. */
function boxAt(p: number, narrow: boolean): Box {
  const pick = (i: number) => (narrow ? BEATS[i].narrow : BEATS[i].wide);
  for (let i = 0; i < BEATS.length - 1; i++) {
    const a = BEATS[i].to - FADE;
    const b = BEATS[i + 1].from + FADE;
    if (p <= a) return pick(i);
    if (p < b) {
      const k = smooth((p - a) / (b - a));
      const [x, y] = [pick(i), pick(i + 1)];
      return [0, 1, 2, 3].map((j) => x[j] + (y[j] - x[j]) * k) as Box;
    }
  }
  return pick(BEATS.length - 1);
}

/**
 * The home page's opening: a full-screen stage that stays put while the visitor
 * scrolls, and plays a house building itself frame by frame under their thumb.
 * The words are real markup passed in from the server; this only moves them.
 *
 * Without JavaScript, or with reduced motion, nothing is pinned: the first
 * words sit over the finished house and the other two follow as plain text.
 */
export function ScrollHero({
  header,
  lead,
  second,
  third,
  mascot,
  soundLabels,
}: {
  header: ReactNode;
  lead: ReactNode;
  second: ReactNode;
  third: ReactNode;
  mascot: ReactNode;
  /** The Sound button's words: [when on, when off]. */
  soundLabels: [on: string, off: string];
}) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sound = useSyncExternalStore(heroSound.subscribe, heroSound.isOn, heroSound.isOnServer);

  useEffect(() => {
    const section = root.current;
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!section || !cv || !ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData === true;
    const set =
      window.matchMedia("(max-width: 767px)").matches || saveData
        ? "mobile"
        : "desktop";
    const count = SEQ[set].count;
    const beats = Array.from(
      section.querySelectorAll<HTMLElement>("[data-beat]"),
    );
    const robot = section.querySelector<HTMLElement>("[data-robot]");

    const frames: Array<HTMLImageElement | undefined> = new Array(count);
    let alive = true;
    let raf = 0;
    let onScreen = true;
    let w = 0;
    let h = 0;
    let shown = -1; // frame last drawn
    let drawnBox = "";
    let frame = reduce ? 1 : 0; // where the sequence is, 0 to 1, eased
    let intro = reduce ? 1 : 0; // 0 to 1: the short build that plays once on arrival
    let introStart = 0;
    let heard = -1; // the build position the sound last caught up with
    let side = 0; // which beat's position the house last settled toward

    const progress = () => {
      const travel = section.offsetHeight - window.innerHeight;
      return travel > 0
        ? clamp(-section.getBoundingClientRect().top / travel)
        : 0;
    };

    /** The loaded frame nearest to `i`, looking back first so the build never jumps ahead. */
    const nearest = (i: number) => {
      for (let d = 0; d < count; d++) {
        if (i - d >= 0 && frames[i - d]) return i - d;
        if (i + d < count && frames[i + d]) return i + d;
      }
      return -1;
    };

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      shown = -1;
    };

    const draw = (p: number) => {
      const narrow = w < 1024;
      const [cx, cy, bw, bh] = reduce
        ? BEATS[0][narrow ? "narrow" : "wide"]
        : boxAt(p, narrow);
      const index = nearest(Math.round(frame * (count - 1)));
      const key = `${cx.toFixed(4)},${cy.toFixed(4)},${bw.toFixed(4)},${bh.toFixed(4)}`;
      if (index < 0 || (index === shown && key === drawnBox)) return;
      shown = index;
      drawnBox = key;

      // Fit the frame inside its box, then soften its edges into the stage.
      const scale = Math.min((bw * w) / SEQ.aspect, bh * h);
      const fw = scale * SEQ.aspect;
      const fh = scale;
      const x = cx * w - fw / 2;
      const y = cy * h - fh / 2;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(frames[index]!, x, y, fw, fh);
      ctx.globalCompositeOperation = "destination-out";
      const edge = (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        rx: number,
        ry: number,
        rw: number,
        rh: number,
      ) => {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(rx, ry, rw, rh);
      };
      const m = fw * 0.07;
      edge(x, 0, x + m, 0, x - 1, y - 1, m + 1, fh + 2);
      edge(x + fw, 0, x + fw - m, 0, x + fw - m, y - 1, m + 1, fh + 2);
      edge(0, y, 0, y + m, x - 1, y - 1, fw + 2, m + 1);
      edge(0, y + fh, 0, y + fh - m, x - 1, y + fh - m, fw + 2, m + 1);
      ctx.globalCompositeOperation = "source-over";

      // The glow and the blueprint grid behind the house follow it.
      section.style.setProperty("--hx", `${(cx * 100).toFixed(2)}%`);
      section.style.setProperty("--hy", `${(cy * 100).toFixed(2)}%`);
    };

    const words = (p: number) => {
      beats.forEach((el, i) => {
        const a = beatAlpha(i, p);
        el.style.opacity = a.toFixed(3);
        el.style.transform = `translate3d(0, ${((1 - a) * (p > BEATS[i].to - FADE ? -28 : 28)).toFixed(1)}px, 0)`;
        el.style.pointerEvents = a > 0.6 ? "auto" : "none";
      });
      if (robot) {
        const k = smooth(clamp((p - 0.8) / 0.12));
        robot.style.transform = `translate3d(0, ${((1 - k) * 110).toFixed(1)}%, 0)`;
      }
      section.style.setProperty("--p", p.toFixed(4));
      section.style.setProperty("--built", frame.toFixed(4));
    };

    const tick = (now: number) => {
      raf = 0;
      if (!alive) return;
      const p = progress();
      if (introStart) {
        intro = clamp((now - introStart) / 1500);
        if (intro >= 1) introStart = 0;
      }
      const base = SEQ.rest * (1 - Math.pow(1 - intro, 3));
      const target = clamp(base + (1 - SEQ.rest) * p);
      // Ease toward the target so a jumpy wheel or thumb still reads as one motion.
      frame += (target - frame) * 0.2;
      if (Math.abs(target - frame) < 0.0005) frame = target;
      // Sound follows the build, and a whoosh marks the house setting off across the screen.
      if (heard >= 0) soundBuild(heard, frame);
      heard = frame;
      const toward = p < (BEATS[0].to + BEATS[1].from) / 2 ? 0 : p < (BEATS[1].to + BEATS[2].from) / 2 ? 1 : 2;
      if (toward !== side && w >= 1024) soundGlide();
      side = toward;
      draw(p);
      // With reduced motion the three beats are plain text in the page; leave them alone.
      if (!reduce) words(p);
      if (onScreen && (introStart || frame !== target)) wake();
    };
    const wake = () => {
      if (!raf && alive) raf = requestAnimationFrame(tick);
    };

    const load = (i: number) =>
      new Promise<void>((done) => {
        if (frames[i]) return done();
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          frames[i] = img;
          shown = -1;
          wake();
          done();
        };
        img.onerror = () => done();
        img.src = framePath(set, i);
      });

    /** Loads `list` a few at a time, in order. */
    const loadAll = async (list: number[]) => {
      let next = 0;
      const worker = async () => {
        while (alive && next < list.length) await load(list[next++]);
      };
      await Promise.all(Array.from({ length: 6 }, worker));
    };

    section.dataset.live = reduce ? "still" : "on";
    size();

    if (reduce) {
      void load(count - 1);
    } else {
      // The opening build first, so it can play; then everything else.
      const restAt = Math.round(SEQ.rest * (count - 1));
      const first = Array.from({ length: restAt + 1 }, (_, i) => i);
      const rest = Array.from(
        { length: count - restAt - 1 },
        (_, i) => restAt + 1 + i,
      );
      const start = () => {
        if (introStart || intro) return;
        if (window.scrollY > 8) intro = 1;
        else introStart = performance.now();
        wake();
      };
      const opening = loadAll(first);
      void opening.then(start);
      void opening.then(() => loadAll(rest));
      window.setTimeout(start, 2500);
    }

    const onResize = () => {
      size();
      wake();
    };
    // A link in a beat that is off screen: scroll to where its beat shows before it takes focus.
    const onFocus = (e: FocusEvent) => {
      const beat = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-beat]",
      );
      if (!beat || reduce || Number(beat.style.opacity || 1) > 0.6) return;
      const i = beats.indexOf(beat);
      const at =
        i === 0 ? 0 : (BEATS[i].from + Math.min(BEATS[i].to, 1)) / 2 + FADE / 2;
      const travel = section.offsetHeight - window.innerHeight;
      window.scrollTo({ top: section.offsetTop + at * travel });
    };
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (onScreen) wake();
    });
    io.observe(section);
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", onResize);
    section.addEventListener("focusin", onFocus);
    wake();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", onResize);
      section.removeEventListener("focusin", onFocus);
    };
  }, []);

  return (
    <section
      ref={root}
      className="sh"
      style={{ "--sh-bg": SEQ.bg } as React.CSSProperties}
      suppressHydrationWarning
    >
      {/* Decides pinned or still before the first paint, so the layout never flips after loading. */}
      <script dangerouslySetInnerHTML={{ __html: LIVE }} />
      <div className="sh-stage">
        <div className="sh-grid" aria-hidden />
        <div className="sh-glow" aria-hidden />
        <canvas ref={canvas} className="sh-canvas" aria-hidden />
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element -- the finished house, for browsers without scripts */}
          <img
            src={framePath("desktop", SEQ.desktop.count - 1)}
            alt=""
            className="sh-still"
          />
        </noscript>
        <button type="button" className="sh-sound" aria-pressed={sound} onClick={() => heroSound.set(!sound)}>
          {sound ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
          {sound ? soundLabels[0] : soundLabels[1]}
        </button>
        <div className="sh-robot" data-robot aria-hidden>
          {mascot}
        </div>
        {header}
        <div className="sh-beat sh-lead" data-beat>
          {lead}
        </div>
        <div className="sh-beat sh-second" data-beat>
          {second}
        </div>
        <div className="sh-beat sh-third" data-beat>
          {third}
        </div>
      </div>
    </section>
  );
}
