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

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Main">
      {items.map((item) => {
        const active =
          (item.href === "/app" ? path === "/app" : path.startsWith(item.href)) || (item.match ?? []).some((m) => path.startsWith(m));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "pp-bounce flex shrink-0 items-center gap-3 rounded-2xl px-3 py-2 text-[15px] transition-[background-color,color] duration-200",
              active ? "bg-[#fff] font-bold text-[#2a1760] shadow-[0_6px_18px_-8px_rgb(0_0_0/0.5)]" : "font-medium text-white/80 hover:bg-white/10 hover:text-white",
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
