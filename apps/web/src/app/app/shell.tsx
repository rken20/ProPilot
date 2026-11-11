import Link from "next/link";
import type { ReactNode } from "react";
import { LogOut, UserRound } from "lucide-react";
import { Logo } from "@/components/logo";
import { Nav, type NavItem } from "./nav";

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

/** Signed-in app frame: dark green sidebar with business, navigation and account. */
export function AppShell({ current, memberships, fullName, items, switchBusiness, children }: ShellProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="flex flex-col gap-6 bg-brand-900 px-3 py-4 text-white lg:sticky lg:top-0 lg:h-screen lg:px-4 lg:py-6">
        <Link href="/app" className="px-2">
          <Logo tone="dark" />
        </Link>

        <div className="rounded-xl bg-white/[0.06] px-3 py-3">
          {memberships.length > 1 ? (
            <form action={switchBusiness} className="flex items-center gap-2">
              <label htmlFor="businessId" className="sr-only">
                Business
              </label>
              <select
                id="businessId"
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
        </div>

        <Nav items={items} />

        <div className="mt-auto hidden border-t border-white/10 pt-4 lg:block">
          <div className="flex items-center gap-3 px-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-semibold">
              {initials(fullName) || <UserRound className="size-4" aria-hidden />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{fullName}</p>
              <Link href="/app/account" className="text-xs text-white/60 hover:text-white">
                Account settings
              </Link>
            </div>
          </div>
          <form action="/auth/signout" method="post" className="mt-3 px-2">
            <button className="flex items-center gap-2 text-sm text-white/60 hover:text-white">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="px-4 py-6 sm:px-8 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-6xl">{children}</div>
        <div className="mt-10 flex gap-4 text-sm lg:hidden">
          <Link href="/app/account" className="text-muted">
            Account settings
          </Link>
          <form action="/auth/signout" method="post">
            <button className="text-muted">Sign out</button>
          </form>
        </div>
      </main>
    </div>
  );
}
