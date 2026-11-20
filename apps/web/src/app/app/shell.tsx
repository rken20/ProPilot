import Link from "next/link";
import type { ReactNode } from "react";
import { LogOut, UserRound } from "lucide-react";
import { Logo } from "@/components/logo";
import { Nav, type NavItem } from "./nav";
import { ThemeToggle } from "@/components/theme-toggle";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", agent: "Agent", marketing: "Marketing" } as const;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export type ShellProps = {
  current: { businessId: string; businessName: string; role: keyof typeof ROLE_LABEL };
  memberships: Array<{ businessId: string; businessName: string }>;
  fullName: string;
  items: NavItem[];
  switchBusiness?: (form: FormData) => Promise<void>;
  children: ReactNode;
};

/** Which business you're in, with a switcher when you belong to more than one. */
function Business({ current, memberships, switchBusiness, id }: Pick<ShellProps, "current" | "memberships" | "switchBusiness"> & { id: string }) {
  return (
    <>
      {memberships.length > 1 ? (
        <form action={switchBusiness} className="flex items-center gap-2">
          <label htmlFor={id} className="sr-only">
            Business
          </label>
          <select
            id={id}
            name="businessId"
            defaultValue={current.businessId}
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-transparent px-2 py-1 text-sm font-medium"
          >
            {memberships.map((m) => (
              <option key={m.businessId} value={m.businessId} className="text-ink">
                {m.businessName}
              </option>
            ))}
          </select>
          <button className="text-xs text-white/70 hover:text-white">Switch</button>
        </form>
      ) : (
        <p className="truncate text-sm font-semibold">{current.businessName}</p>
      )}
      <p className="mt-0.5 text-xs text-white/55">{ROLE_LABEL[current.role]}</p>
    </>
  );
}

/**
 * Signed-in app frame. On computers: a grape sidebar with the business,
 * navigation and account. On phones: an app bar on top and a tab bar at the
 * bottom, so it feels like an app when installed on the home screen.
 */
export function AppShell({ current, memberships, fullName, items, switchBusiness, children }: ShellProps) {
  const avatar = initials(fullName) || <UserRound className="size-4" aria-hidden />;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 flex items-center gap-3 bg-frame-1 px-4 py-2.5 text-white lg:hidden">
        <Link href="/app" aria-label="Dashboard" className="shrink-0">
          <Logo tone="dark" wordmark={false} />
        </Link>
        <div className="min-w-0 flex-1">
          <Business current={current} memberships={memberships} switchBusiness={switchBusiness} id="businessId-bar" />
        </div>
        <Link
          href="/app/account"
          aria-label="Your account"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15 text-sm font-bold transition-colors active:bg-white/25"
        >
          {avatar}
        </Link>
      </header>

      <aside className="hidden flex-col gap-6 bg-gradient-to-b from-grape-800 to-grape-900 px-4 py-6 text-white lg:sticky lg:top-0 lg:flex lg:h-screen">
        <Link href="/app" className="px-2">
          <Logo tone="dark" />
        </Link>

        <div className="rounded-2xl bg-white/10 px-3 py-3">
          <Business current={current} memberships={memberships} switchBusiness={switchBusiness} id="businessId" />
        </div>

        <Nav items={items} />

        <div className="mt-auto border-t border-white/10 pt-4">
          <div className="flex items-center gap-3 px-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-semibold">{avatar}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{fullName}</p>
              <Link href="/app/account" className="text-xs text-white/60 hover:text-white">
                Account settings
              </Link>
            </div>
          </div>
          <ThemeToggle className="mt-3 flex items-center px-2 text-sm text-white/60 hover:text-white" />
          <form action="/auth/signout" method="post" className="mt-3 px-2">
            <button className="flex items-center gap-2 text-sm text-white/60 hover:text-white">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* On phones the page ends above the tab bar (and the home indicator on iPhones). */}
      <main className="px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] pt-5 sm:px-8 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <Nav items={items} variant="tabs" />
    </div>
  );
}
