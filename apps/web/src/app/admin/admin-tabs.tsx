import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/admin/payments", label: "Payments and plans" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/reports", label: "Reports" },
] as const;

/** The way back to the app and the admin screens, shown at the top of each. */
export function AdminTabs({
  current,
}: {
  current: (typeof TABS)[number]["href"];
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <Link
        href="/app"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to MyHomeSeller
      </Link>
      <nav aria-label="Admin" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.href === current ? "page" : undefined}
            className={cx(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
              t.href === current
                ? "bg-frame-1 text-white"
                : "bg-white text-ink ring-1 ring-line hover:bg-grape-50",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
