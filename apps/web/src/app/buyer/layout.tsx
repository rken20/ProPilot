import Link from "next/link";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { getMemberships, getProfile, requireUser } from "@/lib/auth";
import { BuyerNav } from "./nav";

export default async function BuyerLayout({ children }: LayoutProps<"/buyer">) {
  const user = await requireUser();
  const [profile, memberships] = await Promise.all([getProfile(), getMemberships()]);
  const name = profile?.full_name || user.email || "";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/buyer">
            <Logo />
          </Link>
          <BuyerNav />
          <div className="ml-auto flex items-center gap-4 text-sm">
            {memberships.length ? (
              <Link href="/app" className="font-medium text-brand-600 hover:text-brand-700">
                My business
              </Link>
            ) : null}
            <span className="hidden max-w-40 truncate text-muted sm:inline">{name}</span>
            <form action="/auth/signout" method="post">
              <button className="flex items-center gap-1.5 text-muted hover:text-ink" aria-label="Sign out">
                <LogOut className="size-4" aria-hidden />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
