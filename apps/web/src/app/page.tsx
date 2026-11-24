import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleCheck, Home as HomeIcon, Images, MessageCircle, Zap, type LucideIcon } from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui";
import { getUser, homePathFor } from "@/lib/auth";
import { env } from "@/lib/env";
import { Icon3d, type Icon3dName } from "@/components/icon-3d";
import { HeroChat } from "./_home/hero-chat";

export const metadata: Metadata = { alternates: { canonical: "/" } };

/** The plans as the Billing page sells them (prices match the plans table). */
const PLANS: Array<{ name: string; for: string; price: string; icon: Icon3dName; tile: string; lines: string[] }> = [
  { name: "Free", for: "To try it out", price: "₱0", icon: "key", tile: "bg-white", lines: ["Listings with public pages", "Inquiries, Leads and inbox", "1 team member, no AI"] },
  { name: "Basic", for: "Property owners", price: "₱499", icon: "house", tile: "bg-tile-mint", lines: ["AI replies, up to 3,000 a month", "Buyer Finder: 5 buyers a month", "Lead scoring and AI writing", "2 team members"] },
  { name: "Pro", for: "Agents", price: "₱999", icon: "rocket", tile: "bg-tile-lavender", lines: ["AI replies, up to 10,000 a month", "Buyer Finder: 20 buyers a month", "Video Ad Maker: 10 video ads a month", "5 team members"] },
  { name: "Agency", for: "Brokerages and teams", price: "₱2,499", icon: "trophy", tile: "bg-tile-peach", lines: ["AI replies, up to 25,000 a month", "Buyer Finder: 60 buyers a month", "Video Ad Maker: 30 video ads a month", "15 team members"] },
];

const wrap = "mx-auto w-full max-w-6xl px-6 lg:px-8";
const screen = "flex flex-col justify-center py-16 lg:py-20";

/** Four facts in the dashboard's key-number tiles. Each one is true of the product as sold. */
const FACTS: Array<{ icon: LucideIcon; circle: string; tile: string; label: string; value: string; note: string }> = [
  { icon: MessageCircle, circle: "from-[#22b866] to-[#0b8a47]", tile: "bg-tile-mint", label: "AI Replies", value: "24/7", note: "on Messenger and listing pages" },
  { icon: HomeIcon, circle: "from-[#3b82f6] to-[#1d4ed8]", tile: "bg-tile-sky", label: "To Start", value: "₱0", note: "Free plan, no card needed" },
  { icon: Zap, circle: "from-[#e8780c] to-[#c2540a]", tile: "bg-tile-peach", label: "AI From", value: "₱499", note: "a month, paid by GCash" },
  { icon: Images, circle: "from-[#8b5cf6] to-[#5b34c9]", tile: "bg-tile-lavender", label: "Photos per Listing", value: "20", note: "on its own public page" },
];

export default async function Home() {
  const configured = env.isConfigured();
  if (configured && (await getUser())) redirect(await homePathFor());

  return (
    <div className="bg-[var(--pp-ground)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>

      <main id="main">
        {/* Hero: the dashboard's look, on the first screen. */}
        <section className="flex min-h-svh flex-col">
          <header className={`${wrap} flex items-center justify-between py-5`}>
            <Link href="/" aria-label="MyHomeSeller home">
              <Logo />
            </Link>
            <nav className="flex items-center gap-2">
              <Link href="/get-app" className={buttonClass("ghost", "min-h-11 max-sm:hidden")}>
                Get the App
              </Link>
              <Link href="/login" className={buttonClass("ghost", "min-h-11")}>
                Log In
              </Link>
              {configured ? (
                <Link href="/signup" className={buttonClass("primary", "min-h-11 max-sm:hidden")}>
                  Create an Account
                </Link>
              ) : null}
            </nav>
          </header>

          <div className={`${wrap} grid flex-1 items-center gap-12 pb-10 pt-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14`}>
            <div className="pp-stagger">
              <p
                style={{ "--i": 0 } as React.CSSProperties}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#9fdcb8] bg-[#e2f6ea] px-3.5 py-1 text-sm font-bold text-[#0a6d39]"
              >
                <CircleCheck className="size-4.5 fill-[#12a356] text-white" aria-hidden /> Free to start, AI from ₱499 a month
              </p>
              <h1 style={{ "--i": 1 } as React.CSSProperties} className="font-display mt-5 text-[2.4rem] leading-[1.06] font-extrabold text-ink sm:text-[3.2rem] lg:text-[3.5rem]">
                The AI Sales Assistant for Property Owners and Agents
              </h1>
              <p style={{ "--i": 2 } as React.CSSProperties} className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
                It answers buyers on Messenger and on your listing&apos;s page day and night, using only the details you entered. Then
                it sizes up each buyer and shows you who fits each property.
              </p>
              {configured ? (
                <div style={{ "--i": 3 } as React.CSSProperties}>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Link href="/signup" className={buttonClass("primary", "min-h-12 px-7 text-[15px]")}>
                      Create Your Free Account <ArrowRight className="size-4" aria-hidden />
                    </Link>
                    <Link href="#plans" className={buttonClass("secondary", "min-h-12 px-7 text-[15px]")}>
                      See the Plans
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

            <AgentScene />
          </div>

          <ul className={`${wrap} grid grid-cols-2 gap-3 pb-10 lg:grid-cols-4`}>
            {FACTS.map((f) => (
              <li key={f.label} className={`flex flex-col gap-2.5 rounded-[var(--radius-tile)] p-3.5 sm:flex-row sm:items-center sm:gap-3.5 sm:p-4 ${f.tile}`}>
                <span className={`grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br text-white shadow-[0_8px_18px_-8px_rgb(0_0_0/0.45)] ${f.circle}`}>
                  <f.icon className="size-6" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-ink/80">{f.label}</span>
                  <span className="mt-0.5 block text-[1.75rem] leading-none font-extrabold tracking-tight tabular-nums sm:text-[2rem]">{f.value}</span>
                  <span className="mt-1 block text-xs text-muted">{f.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* For agents: the real three-step sequence. */}
        <section className="border-t border-line bg-white">
          <div className={`${wrap} ${screen}`}>
            <div className="max-w-2xl">
              <h2 className="font-display text-[2rem] leading-tight font-extrabold sm:text-[2.6rem]">From Listing to Buyer in Three Steps</h2>
              <p className="mt-3 text-lg text-muted">You do the first step. The AI does the other two while you&apos;re showing another unit.</p>
            </div>
            <ol className="mt-10 grid gap-5 lg:grid-cols-3">
              <Step n={1} icon="houses" title="Add the Listing, Share Its Link" text="Price, financing, reservation fee and up to 20 photos. Each listing gets a public page to post on Facebook or send by text.">
                <FormFragment />
              </Step>
              <Step n={2} icon="robot" title="The AI Answers Every Inquiry" text="On Messenger and on the listing page, from your details only. It notes each buyer's budget, area and timing.">
                <ChatFragment />
              </Step>
              <Step n={3} icon="target" title="Buyer Finder Shows Who Fits" text="Every lead is scored and matched to your listings, so you call the right buyer first.">
                <LeadFragment />
              </Step>
            </ol>
          </div>
        </section>

        {/* Plans: what each costs and includes. Prices match the plans table. */}
        <section id="plans" className="border-t border-line">
          <div className={`${wrap} ${screen}`}>
            <div className="max-w-2xl">
              <h2 className="font-display text-[2rem] leading-tight font-extrabold sm:text-[2.6rem]">Plans for Owners, Agents and Teams</h2>
              <p className="mt-3 text-lg text-muted">Start free with no card. Pay by GCash when you want the AI.</p>
            </div>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {PLANS.map((p) => (
                <li key={p.name} className="pp-bounce flex flex-col overflow-hidden rounded-[1.5rem] border border-line bg-white shadow-[var(--shadow-card)]">
                  <div className="flex items-center justify-between gap-3 bg-frame-1 px-5 py-3 text-white">
                    <div>
                      <h3 className="text-lg font-extrabold tracking-tight">{p.name}</h3>
                      <p className="text-xs font-semibold text-white/70">{p.for}</p>
                    </div>
                    <Icon3d name={p.icon} size={40} />
                  </div>
                  <div className={`flex-1 p-5 ${p.tile}`}>
                    <p>
                      <span className="text-3xl font-extrabold tabular-nums">{p.price}</span>
                      <span className="text-muted"> / month</span>
                    </p>
                    <ul className="mt-4 space-y-2 text-[15px]">
                      {p.lines.map((l) => (
                        <li key={l} className="flex gap-2">
                          <CircleCheck className="mt-0.5 size-4.5 shrink-0 text-brand-600" aria-hidden />
                          <span>{l}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* The dashboard's banner, to close. */}
        <section className="border-t border-line bg-white">
          <div className={`${wrap} py-14 lg:py-16`}>
            <div className="relative isolate flex flex-wrap items-center justify-between gap-x-8 gap-y-6 overflow-hidden rounded-[2rem] border border-line p-7 sm:p-10">
              {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static art */}
              <img src="/images/dashboard/skyline.webp" alt="" width={2000} height={481} loading="lazy" className="absolute inset-0 -z-20 size-full object-cover object-[100%_10%]" />
              <div
                aria-hidden
                className="absolute inset-0 -z-10 bg-gradient-to-r from-[var(--pp-card)] from-30% via-[var(--pp-card)]/80 via-60% to-transparent max-sm:from-0% max-sm:via-[var(--pp-card)]/85 max-sm:to-[var(--pp-card)]/60"
              />
              <div className="min-w-0 max-w-2xl">
                <h2 className="font-display text-[1.9rem] leading-tight font-extrabold italic sm:text-[2.4rem]">Turn Your Property into Profit!</h2>
                <p className="mt-2 text-lg text-ink/80">Put your first listing up today. The AI starts answering tonight.</p>
              </div>
              {configured ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link href="/signup" className={buttonClass("sun", "min-h-12 px-7 text-[15px]")}>
                    Create Your Free Account <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <Link href="/login" className={buttonClass("secondary", "min-h-12 px-6 text-[15px]")}>
                    Log In
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <footer className="bg-frame-1 text-white">
          <div className={`${wrap} flex flex-col gap-4 py-8 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between`}>
            <Logo className="text-white" tone="dark" />
            <Link href="/get-app" className="font-semibold text-white/85 hover:text-white">
              Get the App
            </Link>
            <p>Philippines · 3D icons by Microsoft Fluent Emoji (MIT)</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

/** The dashboard's AI agent card: the mascot in front of the house scene, with a buyer's question being answered underneath. */
function AgentScene() {
  return (
    <div className="pp-enter mx-auto w-full max-w-[540px] overflow-hidden rounded-[2rem] border border-[var(--hero-line)] bg-white shadow-[var(--shadow-lift)] [animation-delay:160ms] lg:mx-0 lg:justify-self-end">
      <div className="relative isolate aspect-[3/2] overflow-hidden bg-[var(--hero-wash)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static art */}
        <img src="/images/dashboard/house.webp" alt="" width={1600} height={893} fetchPriority="high" className="absolute inset-0 -z-10 size-full object-cover object-[38%_50%]" />
        <p className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-[#9fdcb8] bg-[#e2f6ea] px-3 py-0.5 text-sm font-bold text-[#0a6d39]">
          <CircleCheck className="size-4.5 fill-[#12a356] text-white" aria-hidden /> Active 24/7
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static art */}
        <img
          src="/images/dashboard/mascot.webp"
          alt="The MyHomeSeller robot giving a thumbs up"
          width={641}
          height={720}
          className="absolute -bottom-1 left-3 h-[68%] w-auto drop-shadow-[0_16px_22px_rgb(10_31_77/0.35)]"
        />
      </div>
      <div className="border-t border-line p-4 sm:p-5">
        <HeroChat />
      </div>
    </div>
  );
}

function Step({ n, icon, title, text, children }: { n: number; icon: Icon3dName; title: string; text: string; children: ReactNode }) {
  return (
    <li className="pp-bounce flex flex-col overflow-hidden rounded-[1.5rem] border border-line bg-white shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3 bg-frame-1 px-5 py-3 text-white">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-sm font-extrabold text-[#0c2563]">{n}</span>
        <h3 className="text-base font-extrabold tracking-tight">{title}</h3>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start gap-3">
          <Icon3d name={icon} size={44} />
          <p className="text-[15px] leading-relaxed text-muted">{text}</p>
        </div>
        <div className="mt-5 flex-1 content-end">{children}</div>
      </div>
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
      <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-[#1565e6] px-3.5 py-2 text-white">Is there a parking slot?</p>
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
