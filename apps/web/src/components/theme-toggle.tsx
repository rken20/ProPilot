"use client";

import { Moon, Sun } from "lucide-react";

/**
 * Switches between light and dark. The choice is kept in this browser
 * (localStorage) and applied before the page paints by the small script in the
 * root layout. Which label shows is decided in CSS, so there's no flicker.
 */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const dark = root.dataset.theme !== "dark";
    if (dark) root.dataset.theme = "dark";
    else delete root.dataset.theme;
    try {
      localStorage.setItem("pp-theme", dark ? "dark" : "light");
    } catch {
      // Private windows may block storage; the switch still works for this page.
    }
  }
  return (
    <button type="button" onClick={toggle} className={className}>
      <span className="pp-light-only inline-flex items-center gap-2">
        <Moon className="size-4" aria-hidden /> Dark mode
      </span>
      <span className="pp-dark-only inline-flex items-center gap-2">
        <Sun className="size-4" aria-hidden /> Light mode
      </span>
    </button>
  );
}
