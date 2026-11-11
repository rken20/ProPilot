"use client";

import { useEffect, useState } from "react";
import { formatPeso } from "@/lib/money";

/**
 * A number that counts up once when the page opens. Under reduced motion it
 * shows the final value on the first frame. Screen readers get the value only.
 */
export function CountUp({ value, peso, duration = 900 }: { value: number; peso?: boolean; duration?: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let frame = 0;
    if (!value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(p === 1 ? value : Math.round(value * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  const text = peso ? formatPeso(shown) : shown.toLocaleString("en-PH");
  return (
    <>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{peso ? formatPeso(value) : value.toLocaleString("en-PH")}</span>
    </>
  );
}
