import Link from "next/link";
import { can } from "@propilot/shared";
import { getMemberships, getUser, requireBusiness } from "@/lib/auth";
import { switchBusiness } from "./actions";
import { Nav, type NavItem } from "./nav";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", agent: "Agent", marketing: "Marketing" } as const;

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const current = await requireBusiness();
  const [memberships, user] = await Promise.all([getMemberships(), getUser()]);

  const items: NavItem[] = [
    { href: "/app", label: "Overview" },
    { href: "/app/properties", label: "Properties" },
    { href: "/app/leads", label: "Leads", soon: true },
    { href: "/app/inbox", label: "Messenger inbox", soon: true },
    ...(can(current.role, "team.view") ? [{ href: "/app/team", label: "Team" }] : []),
    ...(can(current.role, "billing.view") ? [{ href: "/app/billing", label: "Billing", soon: true }] : []),
  ];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="flex flex-col gap-6 bg-brand-900 p-4 text-brand-50 lg:sticky lg:top-0 lg:h-screen lg:p-5">
        <Link href="/app" className="px-3 text-lg font-semibold tracking-tight">
          ProPilot AI
        </Link>

        <div className="px-3">
          {memberships.length > 1 ? (
            <form action={switchBusiness}>
              <label htmlFor="businessId" className="sr-only">
                Business
              </label>
              <select
                id="businessId"
                name="businessId"
                defaultValue={current.businessId}
                className="w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm"
              >
                {memberships.map((m) => (
                  <option key={m.businessId} value={m.businessId} className="text-zinc-900">
                    {m.businessName}
                  </option>
                ))}
              </select>
              <button className="mt-1 text-xs text-brand-100/70 hover:text-white">Switch</button>
            </form>
          ) : (
            <p className="truncate text-sm font-medium">{current.businessName}</p>
          )}
          <p className="text-xs text-brand-100/60">{ROLE_LABEL[current.role]}</p>
        </div>

        <Nav items={items} />

        <div className="mt-auto hidden px-3 lg:block">
          <p className="truncate text-xs text-brand-100/60">{user?.email}</p>
          <div className="mt-2 flex gap-3 text-sm">
            <Link href="/app/account" className="text-brand-100/80 hover:text-white">
              Account
            </Link>
            <form action="/auth/signout" method="post">
              <button className="text-brand-100/80 hover:text-white">Sign out</button>
            </form>
          </div>
        </div>
      </aside>

      <main className="px-4 py-6 sm:px-8 lg:py-10">
        <div className="mx-auto max-w-5xl">{children}</div>
        <div className="mt-10 flex gap-4 text-sm lg:hidden">
          <Link href="/app/account" className="text-zinc-600">
            Account
          </Link>
          <form action="/auth/signout" method="post">
            <button className="text-zinc-600">Sign out</button>
          </form>
        </div>
      </main>
    </div>
  );
}
