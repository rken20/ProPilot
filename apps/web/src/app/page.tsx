import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui";
import { getUser, homePathFor } from "@/lib/auth";
import { env } from "@/lib/env";
import { HeroChat } from "./_home/hero-chat";
import { HomeEstimator } from "./_home/home-estimator";

const wrap = "mx-auto w-full max-w-6xl px-6 lg:px-8";
const screen = "flex min-h-svh flex-col justify-center py-20 lg:py-24";

export default async function Home() {
  const configured = env.isConfigured();
  if (configured && (await getUser())) redirect(await homePathFor());

  return (
    <div className="bg-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>

      <main id="main">
        {/* Hero: alone on the first screen. */}
        <section className="flex min-h-svh flex-col">
          <header className={`${wrap} flex items-center justify-between py-5`}>
            <Link href="/" aria-label="ProPilot AI home">
              <Logo />
            </Link>
            <nav className="flex items-center gap-2">
              <Link href="/login" className={buttonClass("ghost", "min-h-11")}>
                Log in
              </Link>
              {configured ? (
                <Link href="/signup" className={buttonClass("secondary", "min-h-11 max-sm:hidden")}>
                  Create an account
                </Link>
              ) : null}
            </nav>
          </header>

          <div className={`${wrap} grid flex-1 items-center gap-14 pb-16 pt-8 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-24`}>
            <div className="pp-stagger">
              <h1 style={{ "--i": 0 } as React.CSSProperties} className="font-display text-[2.6rem] leading-[1.05] font-medium text-ink sm:text-6xl lg:text-[4.1rem]">
                The listing assistant for real estate agents in the Philippines
              </h1>
              <p style={{ "--i": 1 } as React.CSSProperties} className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
                Buyers ask about the price, the reservation fee or a Pag-IBIG loan and get an answer in seconds, taken only
                from the details you entered. When they want to see the unit, you get their name, mobile number and
                preferred date.
              </p>
              {configured ? (
                <div style={{ "--i": 2 } as React.CSSProperties}>
                  <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                    <Link href="/signup?as=agent" className={buttonClass("primary", "min-h-12 px-6 text-[15px]")}>
                      List your properties
                    </Link>
                    <Link href="/signup?as=buyer" className={buttonClass("secondary", "min-h-12 px-6 text-[15px]")}>
                      Find a property
                    </Link>
                  </div>
                  <p className="mt-5 text-sm text-muted">Free for agents and buyers while ProPilot is in beta.</p>
                </div>
              ) : (
                <p className="mt-9 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                  Supabase isn&apos;t connected yet. Set the environment variables listed in <code>.env.example</code>.
                </p>
              )}
            </div>

            <ListingFrame />
          </div>
        </section>

        {/* For agents: the real three-step sequence. */}
        <section className="border-t border-line bg-white">
          <div className={`${wrap} ${screen}`}>
            <div className="max-w-2xl">
              <h2 className="font-display text-4xl leading-tight font-medium sm:text-5xl">From listing to viewing in three steps</h2>
              <p className="mt-4 text-lg text-muted">You do the first step. The other two run while you&apos;re showing another unit.</p>
            </div>
            <ol className="mt-14 grid gap-5 lg:grid-cols-3">
              <Step n={1} title="Add the listing once" text="Price, floor area, financing, reservation fee and up to 20 photos. You decide whether buyers can see it.">
                <FormFragment />
              </Step>
              <Step n={2} title="The assistant answers buyers" text="It answers from your listing and nothing else. Loan figures are calculated, never guessed.">
                <ChatFragment />
              </Step>
              <Step n={3} title="Viewing requests reach you" text="Each request lands in Buyer leads with the buyer's mobile number and the date they prefer.">
                <LeadFragment />
              </Step>
            </ol>
          </div>
        </section>

        {/* For buyers: a working estimator. */}
        <section className="border-t border-line">
          <div className={`${wrap} ${screen}`}>
            <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
              <div>
                <h2 className="font-display text-4xl leading-tight font-medium sm:text-5xl">Know the monthly payment before you visit</h2>
                <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
                  Every listing has this estimator, worked out from the listed price. Move the sliders to try your own
                  numbers.
                </p>
                <ul className="mt-8 space-y-4 text-[15px] text-ink">
                  <BuyerPoint>Search by city and budget, with photos on every card.</BuyerPoint>
                  <BuyerPoint>Save the units you like and compare them later.</BuyerPoint>
                  <BuyerPoint>Ask to see a unit. The agent gets your request right away.</BuyerPoint>
                </ul>
                {configured ? (
                  <Link href="/signup?as=buyer" className={buttonClass("primary", "mt-10 min-h-12 px-6 text-[15px]")}>
                    Find a property
                  </Link>
                ) : null}
              </div>
              <HomeEstimator />
            </div>
          </div>
        </section>

        {/* Close and footer on the dark frame colour. */}
        <section className="bg-brand-900 text-white">
          <div className={`${wrap} flex min-h-[70svh] flex-col justify-center py-20`}>
            <h2 className="font-display max-w-3xl text-4xl leading-tight font-medium sm:text-6xl">
              Put your first listing up this week, while ProPilot is free.
            </h2>
            {configured ? (
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup?as=agent" className={buttonClass("inverse", "min-h-12 px-6 text-[15px]")}>
                  List your properties
                </Link>
                <Link href="/login" className={buttonClass("inverseGhost", "min-h-12 px-6 text-[15px]")}>
                  Log in
                </Link>
              </div>
            ) : null}
          </div>
          <footer className={`${wrap} flex flex-col gap-4 border-t border-white/10 py-8 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between`}>
            <Logo className="text-white" tone="dark" />
            <p>Beta, Philippines</p>
          </footer>
        </section>
      </main>
    </div>
  );
}

/** The product itself in a frame: one listing with the assistant answering. */
function ListingFrame() {
  return (
    <div className="pp-enter mx-auto w-full max-w-[520px] [animation-delay:160ms] lg:mx-0 lg:justify-self-end">
      <div className="overflow-hidden rounded-[1.75rem] border border-line bg-white shadow-[var(--shadow-lift)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-3 text-xs text-muted">
          <span className="font-semibold text-ink">Listing</span>
          <span>Mandaluyong</span>
        </div>
        <div className="bg-sand px-6 pb-6 pt-6">
          <p className="text-sm font-medium text-muted">2-bedroom corner unit, 64 m²</p>
          <p className="font-display mt-1 text-[2.6rem] leading-none font-medium tabular-nums text-ink">₱4,800,000</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-white px-3 py-1 text-ink">Ready for occupancy</span>
            <span className="rounded-full bg-white px-3 py-1 text-ink">Pag-IBIG accepted</span>
            <span className="rounded-full bg-white px-3 py-1 text-ink">1 parking slot</span>
          </div>
        </div>
        <div className="px-5 pb-5 pt-4">
          <HeroChat />
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm text-zinc-400" aria-hidden="true">
            <span>Ask about this property</span>
            <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">Send</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, text, children }: { n: number; title: string; text: string; children: ReactNode }) {
  return (
    <li className="flex flex-col rounded-[1.5rem] border border-line bg-surface p-6">
      <span className="font-display text-2xl text-brass">{n}</span>
      <h3 className="mt-3 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{text}</p>
      <div className="mt-6 flex-1 content-end">{children}</div>
    </li>
  );
}

function FormFragment() {
  return (
    <div className="space-y-2.5 rounded-2xl border border-line bg-white p-4 text-sm" aria-hidden="true">
      <Row k="Price" v="₱4,800,000" />
      <Row k="Reservation fee" v="₱20,000" />
      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-muted">Show to ProPilot buyers</span>
        <span className="relative inline-flex h-6 w-10 items-center rounded-full bg-brand-600">
          <span className="absolute right-0.5 size-5 rounded-full bg-white shadow" />
        </span>
      </div>
    </div>
  );
}

function ChatFragment() {
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-white p-4 text-sm" aria-hidden="true">
      <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-white">Is there a parking slot?</p>
      <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-zinc-100 px-3.5 py-2 text-ink">Yes, one slot is included in the price.</p>
    </div>
  );
}

function LeadFragment() {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 text-sm" aria-hidden="true">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-ink">Ana Reyes</span>
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">New</span>
      </div>
      <p className="mt-1.5 text-muted">Wants to view on Saturday, 10:00 AM</p>
      <p className="mt-0.5 text-muted">2-bedroom corner unit, Mandaluyong</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-2.5">
      <span className="text-muted">{k}</span>
      <span className="font-semibold tabular-nums text-ink">{v}</span>
    </div>
  );
}

function BuyerPoint({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brass" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}
