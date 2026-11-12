"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Building2,
  ChartColumn,
  CreditCard,
  Flame,
  LayoutDashboard,
  MessageCircle,
  Plug,
  SquareKanban,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@/components/ui";

const ICONS = {
  dashboard: LayoutDashboard,
  properties: Building2,
  leads: Flame,
  pipeline: SquareKanban,
  agents: Bot,
  inbox: MessageCircle,
  reports: ChartColumn,
  team: Users,
  billing: CreditCard,
  integrations: Plug,
} satisfies Record<string, LucideIcon>;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; soon?: boolean; count?: number };

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Main">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = item.href === "/app" ? path === "/app" : path.startsWith(item.href);
        if (item.soon) {
          return (
            <span
              key={item.href}
              className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/35"
              title="Available later in the beta"
            >
              <Icon className="size-[18px]" aria-hidden />
              <span className="flex-1">{item.label}</span>
              <span className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/50 lg:inline">
                Soon
              </span>
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-[background-color,color] duration-200",
              active ? "bg-white/[0.09] font-semibold text-white shadow-[inset_2px_0_0_#c9a463]" : "text-white/70 hover:bg-white/[0.06] hover:text-white",
            )}
          >
            <Icon className="size-[18px]" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.count ? (
              <span className="rounded-full bg-[#c9a463] px-1.5 py-px text-[11px] font-semibold text-brand-900 tabular-nums" aria-label={`${item.count} waiting`}>
                {item.count > 99 ? "99+" : item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
