"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { Icon3d, type Icon3dName } from "@/components/icon-3d";

const ICONS = {
  dashboard: "house",
  properties: "houses",
  pipeline: "handshake",
  inbox: "chat",
  settings: "gear",
} satisfies Record<string, Icon3dName>;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; count?: number; /** Other paths that belong to this item (its tabs). */ match?: string[] };

function isActive(item: NavItem, path: string) {
  return (item.href === "/app" ? path === "/app" : path.startsWith(item.href)) || (item.match ?? []).some((m) => path.startsWith(m));
}

/** Main navigation: the sidebar list on computers ("side"), the bottom tab bar on phones ("tabs"). */
export function Nav({ items, variant = "side" }: { items: NavItem[]; variant?: "side" | "tabs" }) {
  const path = usePathname();

  if (variant === "tabs") {
    return (
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-10px_30px_-18px_rgb(42_23_96/0.35)] lg:hidden"
      >
        <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((item) => {
            const active = isActive(item, path);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="pp-tab flex flex-col items-center gap-0.5 px-1 pb-1.5 pt-2 text-[11px] leading-tight"
                >
                  <span className={cx("relative grid h-8 w-14 place-items-center rounded-full transition-colors duration-200", active && "bg-grape-100")}>
                    <Icon3d name={ICONS[item.icon]} size={24} />
                    {item.count ? (
                      <span
                        className="absolute -top-0.5 right-0 min-w-4 rounded-full bg-hot px-1 text-center text-[10px] font-bold leading-4 text-white tabular-nums"
                        aria-label={`${item.count} waiting`}
                      >
                        {item.count > 99 ? "99+" : item.count}
                      </span>
                    ) : null}
                  </span>
                  <span className={cx("max-w-full truncate", active ? "font-bold text-grape-700" : "font-medium text-muted")}>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {items.map((item) => {
        const active = isActive(item, path);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "pp-bounce flex shrink-0 items-center gap-3 rounded-2xl px-3 py-2 text-[15px] transition-[background-color,color] duration-200",
              active ? "bg-[#fff] font-bold text-[#0a1f4d] shadow-[0_6px_18px_-8px_rgb(0_0_0/0.5)]" : "font-medium text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon3d name={ICONS[item.icon]} size={30} />
            <span className="flex-1">{item.label}</span>
            {item.count ? (
              <span className="rounded-full bg-hot px-2 py-px text-xs font-bold text-white tabular-nums" aria-label={`${item.count} waiting`}>
                {item.count > 99 ? "99+" : item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
