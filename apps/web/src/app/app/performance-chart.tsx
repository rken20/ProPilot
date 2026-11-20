"use client";

import { useState } from "react";
import { niceScale, type PerfPoint } from "@/lib/dashboard-stats";

// Colors checked for both themes with the dataviz palette validator (all pairs, color-blind safe).
// Orange and green are below 3:1 on the light card, so every value is also in the legend,
// the tooltip and the table.
const SERIES = [
  { key: "views", name: "Views", color: "var(--chart-listing)" },
  { key: "inquiries", name: "Inquiries", color: "var(--chart-green)" },
  { key: "viewings", name: "Viewings", color: "var(--chart-messenger)" },
] as const;

/**
 * Running totals for the last 30 days as three lines on one scale. Hover, touch
 * or use the arrow keys to read any day; the legend carries the totals.
 */
export function PerformanceChart({ points }: { points: PerfPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const last = points[n - 1];
  if (!last) return null;
  const scale = niceScale(Math.max(last.views, last.inquiries, last.viewings));
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const y = (v: number) => 100 - (v / scale.max) * 100;
  const ticks = Array.from({ length: scale.max / scale.step + 1 }, (_, i) => i * scale.step);
  const dateTicks = [...new Set([0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round(((n - 1) * 3) / 4), n - 1])];
  const shown = active === null ? null : points[active];

  function pick(clientX: number, el: HTMLElement) {
    const box = el.getBoundingClientRect();
    setActive(Math.min(n - 1, Math.max(0, Math.round(((clientX - box.left) / box.width) * (n - 1)))));
  }

  return (
    <figure>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2">
            <span aria-hidden className="h-[3px] w-4 rounded-full" style={{ background: s.color }} />
            <span className="text-muted">{s.name}</span>
            <span className="font-bold tabular-nums">{last[s.key].toLocaleString("en-PH")}</span>
          </span>
        ))}
      </figcaption>

      <div className="mt-4 flex">
        <div aria-hidden className="relative h-44 w-9 shrink-0 text-[11px] text-muted tabular-nums sm:h-52">
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 translate-y-1/2" style={{ bottom: `${(t / scale.max) * 100}%` }}>
              {t.toLocaleString("en-PH")}
            </span>
          ))}
        </div>
        <div
          tabIndex={0}
          role="group"
          aria-label="Chart of views, inquiries and viewings. Use the left and right arrow keys to read each day."
          className="relative h-44 min-w-0 flex-1 cursor-crosshair touch-pan-y rounded-sm outline-offset-4 sm:h-52"
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((a) => a ?? n - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            setActive((a) => Math.min(n - 1, Math.max(0, (a ?? n - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
          }}
        >
          {ticks.map((t) => (
            <span key={t} aria-hidden className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / scale.max) * 100}%` }} />
          ))}
          <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            {SERIES.map((s) => (
              <path
                key={s.key}
                d={points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(2)} ${y(p[s.key]).toFixed(2)}`).join("")}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {/* End dots, and a dot per line on the day being read. The ring in the card's color keeps them clear of the lines. */}
          {SERIES.map((s) => (
            <span
              key={s.key}
              aria-hidden
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--pp-card)]"
              style={{ left: `${x(active ?? n - 1)}%`, top: `${y((shown ?? last)[s.key])}%`, background: s.color }}
            />
          ))}
          {shown && active !== null ? (
            <>
              <span aria-hidden className="absolute inset-y-0 w-px -translate-x-1/2 bg-ink/25" style={{ left: `${x(active)}%` }} />
              <div
                role="status"
                className="pointer-events-none absolute top-0 z-10 w-max rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-[var(--shadow-card)]"
                style={x(active) > 55 ? { right: `calc(${100 - x(active)}% + 10px)` } : { left: `calc(${x(active)}% + 10px)` }}
              >
                <p className="text-muted">Up to {shown.label}</p>
                {SERIES.map((s) => (
                  <p key={s.key} className="mt-1 flex items-center gap-2">
                    <span aria-hidden className="h-[3px] w-3 rounded-full" style={{ background: s.color }} />
                    <span className="text-sm font-bold tabular-nums">{shown[s.key].toLocaleString("en-PH")}</span>
                    <span className="text-muted">{s.name.toLowerCase()}</span>
                  </p>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div aria-hidden className="relative ml-9 mt-2 h-4 text-[11px] text-muted">
        {dateTicks.map((i, k) => (
          <span
            key={i}
            className={k === 0 ? "absolute left-0" : k === dateTicks.length - 1 ? "absolute right-0" : "absolute -translate-x-1/2"}
            style={k === 0 || k === dateTicks.length - 1 ? undefined : { left: `${x(i)}%` }}
          >
            {points[i]!.label}
          </span>
        ))}
      </div>

      {/* The same numbers as a table, for screen readers. The 1px wrapper matters: see reports-view. */}
      <div className="sr-only">
        <table>
          <caption>Running totals of views, inquiries and viewings by day</caption>
          <thead>
            <tr>
              <th>Day</th>
              {SERIES.map((s) => (
                <th key={s.key}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.label}>
                <td>{p.label}</td>
                {SERIES.map((s) => (
                  <td key={s.key}>{p[s.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
