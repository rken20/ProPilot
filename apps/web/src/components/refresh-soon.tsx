"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetch the page a few times, for work that finishes just after the response (e.g. photo imports). */
export function RefreshSoon({ every = 3000, times = 6 }: { every?: number; times?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = window.setInterval(() => {
      router.refresh();
      if (++n >= times) window.clearInterval(id);
    }, every);
    return () => window.clearInterval(id);
  }, [router, every, times]);
  return null;
}
