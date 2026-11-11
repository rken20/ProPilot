"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/buyer", label: "Browse" },
  { href: "/buyer/saved", label: "Saved" },
  { href: "/buyer/viewings", label: "My viewings" },
  { href: "/buyer/messages", label: "Messages" },
];

export function BuyerNav() {
  const path = usePathname();
  return (
    <nav className="order-last flex w-full gap-1 sm:order-none sm:w-auto" aria-label="Main">
      {ITEMS.map((item) => {
        const active = item.href === "/buyer" ? path === "/buyer" || path.startsWith("/buyer/listings") : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              active ? "bg-brand-50 font-semibold text-brand-700" : "text-muted hover:bg-surface hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
