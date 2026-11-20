import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui";
import { Photo } from "@/components/photo";
import { getUser, homePathFor } from "@/lib/auth";
import { env } from "@/lib/env";
import { Icon3d, type Icon3dName } from "@/components/icon-3d";
import { HeroChat } from "./_home/hero-chat";

/** The plans as the Billing page sells them (prices match the plans table). */
const PLANS: Array<{ name: string; for: string; price: string; icon: Icon3dName; tile: string; lines: string[] }> = [
  { name: "Free", for: "To try it out", price: "₱0", icon: "key", tile: "bg-white border border-line", lines: ["Listings with public pages", "Inquiries, Pipeline and inbox", "1 team member, no AI"] },
  { name: "Basic", for: "Property owners", price: "₱499", icon: "house", tile: "bg-tile-mint", lines: ["AI replies, up to 3,000 a month", "Buyer Finder: 5 buyers a month", "Lead scoring and AI writing", "2 team members"] },
  { name: "Pro", for: "Agents", price: "₱999", icon: "rocket", tile: "bg-tile-lavender", lines: ["AI replies, up to 10,000 a month", "Buyer Finder: 20 buyers a month", "AI listing videos (coming soon)", "5 team members"] },
  { name: "Agency", for: "Brokerages and teams", price: "₱2,499", icon: "trophy", tile: "bg-tile-peach", lines: ["AI replies, up to 25,000 a month", "Buyer Finder: 60 buyers a month", "AI listing videos (coming soon)", "15 team members"] },
];

const wrap = "mx-auto w-full max-w-6xl px-6 lg:px-8";
const screen = "flex min-h-svh flex-col justify-center py-20 lg:py-24";

export default async function Home() {
  const configured = env.isConfigured();
  if (configured && (await getUser())) redirect(await homePathFor());

  return (
    <div className="bg-[var(--pp-ground)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>

      <main id="main">
        {/* Hero: alone on the first screen. */}
        <section className="flex min-h-svh flex-col">
          <header className={`${wrap} flex items-center justify-between py-5`}>
            <Link href="/" aria-label="MyHomeSeller home">
              <Logo />
            </Link>
            <nav className="flex items-center gap-2">
              <Link href="/get-app" className={buttonClass("ghost", "min-h-11 max-sm:hidden")}>
                Get the app
              </Link>
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
              <p style={{ "--i": 0 } as React.CSSProperties} className="inline-flex items-center gap-2 rounded-full bg-tile-mint px-3 py-1 text-sm font-bold text-brand-700">
                <Icon3d name="sparkles" size={20} /> Free to start, Basic from ₱499 a month
              </p>
              <h1 style={{ "--i": 1 } as React.CSSProperties} className="font-display mt-5 text-[2.6rem] leading-[1.05] font-extrabold text-ink sm:text-6xl lg:text-[4rem]">
                The AI sales assistant for property owners and agents
              </h1>
              <p style={{ "--i": 2 } as React.CSSProperties} className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
                It answers buyers on Messenger and on your listing&apos;s page day and night, using only the details you entered. Then
                it sizes up each buyer and shows you who fits each property.
              </p>
              {configured ? (
                <div style={{ "--i": 3 } as React.CSSProperties}>
                  <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                    <Link href="/signup" className={buttonClass("primary", "min-h-12 px-7 text-[15px]")}>
                      Create your free account
                    </Link>
                    <Link href="#plans" className={buttonClass("secondary", "min-h-12 px-7 text-[15px]")}>
                      See the plans
                    </Link>
                  </div>
                  <p className="mt-5 text-sm text-muted">Made in the Philippines, for Pag-IBIG, bank and in-house financing.</p>
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
              <h2 className="font-display text-4xl leading-tight font-extrabold sm:text-5xl">From listing to buyer in three steps</h2>
              <p className="mt-4 text-lg text-muted">You do the first step. The AI does the other two while you&apos;re showing another unit.</p>
            </div>
            <ol className="mt-14 grid gap-5 lg:grid-cols-3">
              <Step n={1} icon="houses" tile="bg-tile-lavender" title="Add the listing, share its link" text="Price, financing, reservation fee and up to 20 photos. Each listing gets a public page to post on Facebook or send by text.">
                <FormFragment />
              </Step>
              <Step n={2} icon="robot" tile="bg-tile-mint" title="The AI answers every inquiry" text="On Messenger and on the listing page, from your details only. It notes each buyer's budget, area and timing.">
                <ChatFragment />
              </Step>
              <Step n={3} icon="target" tile="bg-tile-peach" title="Buyer Finder shows who fits" text="Every lead is scored and matched to your listings, so you call the right buyer first.">
                <LeadFragment />
              </Step>
            </ol>
          </div>
        </section>

        {/* Plans: what each costs and includes. Prices match the plans table. */}
        <section id="plans" className="border-t border-line">
          <div className={`${wrap} ${screen}`}>
            <div className="max-w-2xl">
              <h2 className="font-display text-4xl leading-tight font-extrabold sm:text-5xl">Plans for owners, agents and teams</h2>
              <p className="mt-4 text-lg text-muted">Start free with no card. Pay by GCash when you want the AI.</p>
            </div>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {PLANS.map((p) => (
                <li key={p.name} className={`pp-bounce flex flex-col rounded-[1.5rem] p-6 ${p.tile}`}>
                  <Icon3d name={p.icon} size={52} />
                  <h3 className="mt-4 text-xl font-extrabold">{p.name}</h3>
                  <p className="text-sm font-semibold text-muted">{p.for}</p>
                  <p className="mt-3">
                    <span className="text-3xl font-extrabold tabular-nums">{p.price}</span>
                    <span className="text-muted"> / month</span>
                  </p>
                  <ul className="mt-4 space-y-2 text-[15px]">
                    {p.lines.map((l) => (
                      <li key={l} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            {configured ? (
              <Link href="/signup" className={buttonClass("primary", "mt-10 min-h-12 self-start px-7 text-[15px]")}>
                Create your free account
              </Link>
            ) : null}
          </div>
        </section>

        {/* Close and footer on the dark frame colour. */}
        <section className="relative isolate overflow-hidden bg-grape-900 text-white">
          <Photo
            name="manila-skyline"
            widths={[1000, 1600, 2400]}
            sizes="100vw"
            className="absolute inset-0 -z-10 size-full object-cover object-[50%_45%]"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-grape-900/90 via-grape-800/65 to-grape-700/25" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-grape-900 to-transparent" aria-hidden="true" />
          <div className={`${wrap} flex min-h-[70svh] flex-col justify-center py-20`}>
            <h2 className="font-display max-w-3xl text-4xl leading-tight font-extrabold sm:text-6xl">
              Put your first listing up today. The AI starts answering tonight.
            </h2>
            {configured ? (
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className={buttonClass("primary", "min-h-12 px-7 text-[15px]")}>
                  Create your free account
                </Link>
                <Link href="/login" className={buttonClass("inverseGhost", "min-h-12 px-6 text-[15px]")}>
                  Log in
                </Link>
              </div>
            ) : null}
          </div>
          <footer className={`${wrap} flex flex-col gap-4 border-t border-white/10 py-8 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between`}>
            <Logo className="text-white" tone="dark" />
            <Link href="/get-app" className="font-semibold text-white/85 hover:text-white">
              Get the app
            </Link>
            <p>Philippines · 3D icons by Microsoft Fluent Emoji (MIT)</p>
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
        <div className="relative aspect-[16/9] overflow-hidden bg-sand">
          <Photo
            name="condo-living"
            widths={[640, 1040, 1400]}
            sizes="(min-width: 1024px) 520px, 100vw"
            priority
            className="pp-settle absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent px-6 pb-5 pt-16 text-white">
            <p className="text-sm font-medium text-white/85">2-bedroom corner unit, 64 m²</p>
            <p className="font-display mt-1 text-[2.4rem] leading-none font-medium tabular-nums">₱4,800,000</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3.5 text-xs font-medium">
          <span className="rounded-full bg-sand px-3 py-1 text-ink">Ready for occupancy</span>
          <span className="rounded-full bg-sand px-3 py-1 text-ink">Pag-IBIG accepted</span>
          <span className="rounded-full bg-sand px-3 py-1 text-ink">1 parking slot</span>
        </div>
        <div className="px-5 pb-5 pt-4">
          <HeroChat />
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm text-zinc-500" aria-hidden="true">
            <span>Ask about this property</span>
            <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">Send</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, icon, tile, title, text, children }: { n: number; icon: Icon3dName; tile: string; title: string; text: string; children: ReactNode }) {
  return (
    <li className={`pp-bounce flex flex-col rounded-[1.5rem] p-6 ${tile}`}>
      <div className="flex items-center justify-between">
        <Icon3d name={icon} size={52} />
        <span className="grid size-9 place-items-center rounded-full bg-white text-sm font-extrabold text-grape-700">{n}</span>
      </div>
      <h3 className="mt-4 text-lg font-extrabold text-ink">{title}</h3>
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
        <span className="text-muted">Public page</span>
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
        <span className="rounded-full bg-hot-50 px-2.5 py-0.5 text-xs font-bold text-hot">Hot</span>
      </div>
      <p className="mt-1.5 text-muted">Budget ₱5M, Pasig, Pag-IBIG</p>
      <p className="mt-0.5 font-semibold text-brand-700">92% match: 2-bedroom corner unit</p>
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
