"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export type SectionTab = { href: string; label: string; count?: number };

/**
 * Tabs for pages that share one sidebar item (Dashboard, Leads, Settings).
 * Shown only on the tab pages themselves, not on their sub-pages.
 */
export function SectionTabs({ groups }: { groups: SectionTab[][] }) {
  const path = usePathname();
  const tabs = groups.find((g) => g.some((t) => t.href === path));
  if (!tabs || tabs.length < 2) return null;
  return (
    // Pills in one rounded bar, the current one navy like the dashboard's panel headers. The bar
    // swipes sideways on narrow screens; its scrollbar is hidden.
    <nav
      aria-label="Section"
      className="-mt-1 mb-6 flex w-fit max-w-full gap-1 overflow-x-auto overflow-y-hidden rounded-full border border-line bg-white p-1 shadow-[var(--shadow-card)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => {
        const active = t.href === path;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors",
              active ? "bg-frame-1 font-bold text-white" : "font-medium text-muted hover:bg-grape-50 hover:text-ink",
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
