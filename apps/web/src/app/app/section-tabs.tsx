"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export type SectionTab = { href: string; label: string; count?: number };

/**
 * Tabs for pages that share one sidebar item (Dashboard, Pipeline, Settings).
 * Shown only on the tab pages themselves, not on their sub-pages.
 */
export function SectionTabs({ groups }: { groups: SectionTab[][] }) {
  const path = usePathname();
  const tabs = groups.find((g) => g.some((t) => t.href === path));
  if (!tabs || tabs.length < 2) return null;
  return (
    <nav aria-label="Section" className="-mt-1 mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const active = t.href === path;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors",
              active ? "border-brand-600 font-semibold text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count ? (
              <span className="rounded-full bg-brass-50 px-1.5 py-px text-xs font-semibold text-brass tabular-nums" aria-label={`${t.count} waiting`}>
                {t.count > 99 ? "99+" : t.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
