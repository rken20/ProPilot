import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, House } from "lucide-react";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui";
import { getUser, homePathFor } from "@/lib/auth";
import { env } from "@/lib/env";

export default async function Home() {
  if (env.isConfigured() && (await getUser())) redirect(await homePathFor());
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <Link href="/login" className={buttonClass("secondary")}>
          Log in
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20 pt-10 sm:pt-16">
        <h1 className="max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-[56px]">
          The smarter way to buy and sell property in the Philippines.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Ask about any listing and get a straight answer, any hour. Agents get every inquiry handled and the ready
          buyers sent to them.
        </p>
        {env.isConfigured() ? (
          <div className="mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            <Entry
              href="/signup?as=buyer"
              icon={<House className="size-6" aria-hidden />}
              title="I'm looking for a property"
              text="Browse listings, compare financing, and book viewings."
              cta="Start browsing"
            />
            <Entry
              href="/signup?as=agent"
              icon={<Building2 className="size-6" aria-hidden />}
              title="I sell or manage properties"
              text="List properties and let the AI handle buyer questions."
              cta="Set up my listings"
            />
          </div>
        ) : (
          <p className="mt-10 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Supabase isn&apos;t connected yet. Set the environment variables listed in <code>.env.example</code>.
          </p>
        )}
      </main>
    </div>
  );
}

function Entry({ href, icon, title, text, cta }: { href: string; icon: React.ReactNode; title: string; text: string; cta: string }) {
  return (
    <Link href={href} className="group rounded-2xl border border-line bg-white p-6 transition-colors hover:border-brand-600">
      <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
      <span className="mt-5 block text-lg font-bold">{title}</span>
      <span className="mt-1 block text-sm text-muted">{text}</span>
      <span className="mt-5 inline-flex text-sm font-semibold text-brand-600 group-hover:text-brand-700">{cta}</span>
    </Link>
  );
}
