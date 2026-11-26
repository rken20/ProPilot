import { siteLang } from "@/lib/lang-server";
import { sayIn, type Lang, type Say } from "@/lib/lang";
import { SiteLangToggle } from "@/components/site-lang-toggle";
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
import { ScrollHero } from "./_home/scroll-hero";

export const metadata: Metadata = { alternates: { canonical: "/" } };

/** The plans as the Billing page sells them (prices match the plans table). */
type Pair = [english: string, taglish: string];
const PLANS: Array<{ name: string; for: Pair; price: string; icon: Icon3dName; tile: string; lines: Pair[] }> = [
  { name: "Free", for: ["To try it out", "Para masubukan"], price: "₱0", icon: "key", tile: "bg-white", lines: [["Listings with public pages", "Listings na may public pages"], ["Inquiries, Leads and inbox", "Inquiries, Leads at inbox"], ["1 team member, no AI", "1 team member, walang AI"]] },
  { name: "Basic", for: ["Property owners", "Para sa property owners"], price: "₱499", icon: "house", tile: "bg-tile-mint", lines: [["AI replies, up to 3,000 a month", "AI replies, hanggang 3,000 kada buwan"], ["Buyer Finder: 5 buyers a month", "Buyer Finder: 5 buyers kada buwan"], ["Lead scoring and AI writing", "Lead scoring at AI writing"], ["2 team members", "2 team members"]] },
  { name: "Pro", for: ["Agents", "Para sa mga agent"], price: "₱999", icon: "rocket", tile: "bg-tile-lavender", lines: [["AI replies, up to 10,000 a month", "AI replies, hanggang 10,000 kada buwan"], ["Buyer Finder: 20 buyers a month", "Buyer Finder: 20 buyers kada buwan"], ["Video Ad Maker: 10 video ads a month", "Video Ad Maker: 10 video ads kada buwan"], ["5 team members", "5 team members"]] },
  { name: "Agency", for: ["Brokerages and teams", "Para sa brokerages at teams"], price: "₱2,499", icon: "trophy", tile: "bg-tile-peach", lines: [["AI replies, up to 25,000 a month", "AI replies, hanggang 25,000 kada buwan"], ["Buyer Finder: 60 buyers a month", "Buyer Finder: 60 buyers kada buwan"], ["Video Ad Maker: 30 video ads a month", "Video Ad Maker: 30 video ads kada buwan"], ["15 team members", "15 team members"]] },
];

const wrap = "mx-auto w-full max-w-6xl px-6 lg:px-8";
const screen = "flex flex-col justify-center py-16 lg:py-20";

/** Four facts in the dashboard's key-number tiles. Each one is true of the product as sold. */
const FACTS: Array<{ icon: LucideIcon; circle: string; tile: string; label: string; value: string; note: [english: string, taglish: string] }> = [
  { icon: MessageCircle, circle: "from-[#22b866] to-[#0b8a47]", tile: "bg-tile-mint", label: "AI Replies", value: "24/7", note: ["on Messenger and listing pages", "sa Messenger at listing pages"] },
  { icon: HomeIcon, circle: "from-[#3b82f6] to-[#1d4ed8]", tile: "bg-tile-sky", label: "To Start", value: "₱0", note: ["Free plan, no card needed", "Free plan, hindi kailangan ng card"] },
  { icon: Zap, circle: "from-[#e8780c] to-[#c2540a]", tile: "bg-tile-peach", label: "AI From", value: "₱499", note: ["a month, paid by GCash", "kada buwan, bayad via GCash"] },
  { icon: Images, circle: "from-[#8b5cf6] to-[#5b34c9]", tile: "bg-tile-lavender", label: "Photos per Listing", value: "20", note: ["on its own public page", "sa sarili nitong public page"] },
];

export default async function Home() {
  const configured = env.isConfigured();
  if (configured && (await getUser())) redirect(await homePathFor());
  const lang = await siteLang();
  const say = sayIn(lang);

  return (
    <div className="bg-[var(--pp-ground)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>

      <main id="main">
        {/* Opening: a house builds itself as the visitor scrolls, with the pitch in three beats over it. */}
        <ScrollHero
          header={
            <header className={`${wrap} sh-header flex items-center justify-between py-5`}>
              <Link href="/" aria-label="MyHomeSeller home">
                <Logo className="text-white" tone="dark" />
              </Link>
              <nav className="flex items-center gap-1.5">
                <Link href="/properties" className="sh-link">
                  Properties
                </Link>
                <Link href="/get-app" className="sh-link max-sm:hidden">
                  Get the App
                </Link>
                <Link href="/login" className="sh-link">
                  Log In
                </Link>
                {configured ? (
                  <Link href="/signup" className={buttonClass("primary", "ml-1.5 min-h-11 max-sm:hidden")}>
                    Create an Account
                  </Link>
                ) : null}
              </nav>
            </header>
          }
          lead={
            <div className={wrap}>
              <div className="sh-copy pp-stagger">
                <p
                  style={{ "--i": 0 } as React.CSSProperties}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#9fdcb8] bg-[#e2f6ea] px-3.5 py-1 text-sm font-bold text-[#0a6d39] max-sm:hidden"
                >
                  <CircleCheck className="size-4.5 fill-[#12a356] text-white" aria-hidden /> Free to start, AI from ₱499 a month
                </p>
                <h1 style={{ "--i": 1 } as React.CSSProperties} className="sh-h1 font-display sm:mt-5">
                  The AI Sales Assistant for Property Owners and Agents
                </h1>
                <p style={{ "--i": 2 } as React.CSSProperties} className="sh-sub">
                  {say(
                    "It answers buyers on Messenger and on your listing's page day and night, using only the details you entered.",
                    "Sumasagot ito sa buyers sa Messenger at sa page ng listing mo, araw at gabi, gamit lang ang details na nilagay mo.",
                  )}
                </p>
                {configured ? (
                  <div style={{ "--i": 3 } as React.CSSProperties}>
                    <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row">
                      <Link href="/signup" className={buttonClass("sun", "min-h-12 px-7 text-[15px]")}>
                        Create Your Free Account <ArrowRight className="size-4" aria-hidden />
                      </Link>
                      <Link href="#plans" className="sh-outline max-sm:hidden">
                        See the Plans
                      </Link>
                    </div>
                    <p className="mt-5 text-sm text-white/60 max-lg:hidden">{say("Made in the Philippines, for Pag-IBIG, bank and in-house financing.", "Gawang Pinoy, para sa Pag-IBIG, bank at in-house financing.")}</p>
                  </div>
                ) : (
                  <p className="mt-9 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    Supabase isn&apos;t connected yet. Set the environment variables listed in <code>.env.example</code>.
                  </p>
                )}
              </div>
            </div>
          }
          second={
            <div className={wrap}>
              <div className="sh-copy sh-copy-far">
                <h2 className="sh-h2 font-display">It Gets to Know Every Buyer</h2>
                <p className="sh-sub">
                  {say(
                    "As it chats, it notes each buyer's budget, preferred area and timing, and scores the lead for you.",
                    "Habang nakikipag-chat, tinatandaan nito ang budget, gustong area at timing ng bawat buyer, at binibigyan nito ng score ang lead para sa'yo.",
                  )}
                </p>
              </div>
            </div>
          }
          third={
            <div className={wrap}>
              <div className="sh-copy">
                <h2 className="sh-h2 font-display">Then It Shows You Who Fits Each Property</h2>
                <p className="sh-sub">{say("Open your dashboard and call the right buyer first.", "Buksan ang dashboard mo at ang tamang buyer ang unahin mong tawagan.")}</p>
                {configured ? (
                  <Link href="/signup" className={buttonClass("sun", "mt-6 min-h-12 px-7 text-[15px] sm:mt-8")}>
                    Create Your Free Account <ArrowRight className="size-4" aria-hidden />
                  </Link>
                ) : null}
              </div>
            </div>
          }
          soundLabels={{ on: "Sound On", off: "Sound Off", waiting: "Tap for Sound" }}
          mascot={
            // eslint-disable-next-line @next/next/no-img-element -- pre-sized static art
            <img src="/images/dashboard/mascot.webp" alt="" width={641} height={720} loading="lazy" />
          }
        />

        {/* The assistant at work, and four facts about the product. */}
        <section className="border-t border-line">
          <div className={`${wrap} grid items-center gap-12 py-16 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:py-20`}>
            <div>
              <h2 className="font-display text-[2rem] leading-tight font-extrabold sm:text-[2.6rem]">Watch It Answer a Buyer</h2>
              <p className="mt-3 max-w-xl text-lg text-muted">
                {say(
                  "A buyer asks about the reservation fee and Pag-IBIG. The answer comes from the listing's own details.",
                  "Nagtanong ang buyer tungkol sa reservation fee at Pag-IBIG. Galing sa sariling details ng listing ang sagot.",
                )}
              </p>
              <ul className="mt-8 grid grid-cols-2 gap-3">
                {FACTS.map((f) => (
                  <li key={f.label} className={`flex flex-col gap-2.5 rounded-[var(--radius-tile)] p-3.5 sm:flex-row sm:items-center sm:gap-3.5 sm:p-4 ${f.tile}`}>
                    <span className={`grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br text-white shadow-[0_8px_18px_-8px_rgb(0_0_0/0.45)] ${f.circle}`}>
                      <f.icon className="size-6" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-ink/80">{f.label}</span>
                      <span className="mt-0.5 block text-[1.75rem] leading-none font-extrabold tracking-tight tabular-nums sm:text-[2rem]">{f.value}</span>
                      <span className="mt-1 block text-xs text-muted">{say(...f.note)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <AgentScene lang={lang} />
          </div>
        </section>

        {/* For agents: the real three-step sequence. */}
        <section className="border-t border-line bg-white">
          <div className={`${wrap} ${screen}`}>
            <div className="max-w-2xl">
              <h2 className="font-display text-[2rem] leading-tight font-extrabold sm:text-[2.6rem]">From Listing to Buyer in Three Steps</h2>
              <p className="mt-3 text-lg text-muted">{say("You do the first step. The AI does the other two while you're showing another unit.", "Ikaw sa unang step. Ang AI na ang bahala sa dalawa pa habang nagpapakita ka ng ibang unit.")}</p>
            </div>
            <ol className="mt-10 grid gap-5 lg:grid-cols-3">
              <Step n={1} icon="houses" title="Add the Listing, Share Its Link" text={say("Price, financing, reservation fee and up to 20 photos. Each listing gets a public page to post on Facebook or send by text.", "Presyo, financing, reservation fee at hanggang 20 photos. May sariling public page ang bawat listing na pwedeng i-post sa Facebook o i-send sa text.")}>
                <FormFragment />
              </Step>
              <Step n={2} icon="robot" title="The AI Answers Every Inquiry" text={say("On Messenger and on the listing page, from your details only. It notes each buyer's budget, area and timing.", "Sa Messenger at sa listing page, gamit lang ang details na nilagay mo. Tinatandaan nito ang budget, area at timing ng bawat buyer.")}>
                <ChatFragment say={say} />
              </Step>
              <Step n={3} icon="target" title="Buyer Finder Shows Who Fits" text={say("Every lead is scored and matched to your listings, so you call the right buyer first.", "May score at naka-match sa listings mo ang bawat lead, kaya ang tamang buyer ang una mong tatawagan.")}>
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
              <p className="mt-3 text-lg text-muted">{say("Start free with no card. Pay by GCash when you want the AI.", "Libre magsimula, walang card. Magbayad via GCash kapag gusto mo na ng AI.")}</p>
            </div>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {PLANS.map((p) => (
                <li key={p.name} className="pp-bounce flex flex-col overflow-hidden rounded-[1.5rem] border border-line bg-white shadow-[var(--shadow-card)]">
                  <div className="flex items-center justify-between gap-3 bg-frame-1 px-5 py-3 text-white">
                    <div>
                      <h3 className="text-lg font-extrabold tracking-tight">{p.name}</h3>
                      <p className="text-xs font-semibold text-white/70">{say(...p.for)}</p>
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
                        <li key={l[0]} className="flex gap-2">
                          <CircleCheck className="mt-0.5 size-4.5 shrink-0 text-brand-600" aria-hidden />
                          <span>{say(...l)}</span>
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
                <p className="mt-2 text-lg text-ink/80">{say("Put your first listing up today. The AI starts answering tonight.", "I-post ang una mong listing ngayon. Mamayang gabi, sasagot na ang AI.")}</p>
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
            <Link href="/properties" className="font-semibold text-white/85 hover:text-white">
              Properties
            </Link>
            <Link href="/get-app" className="font-semibold text-white/85 hover:text-white">
              Get the App
            </Link>
            <SiteLangToggle lang={lang} tone="dark" />
            <p>Philippines · 3D icons by Microsoft Fluent Emoji (MIT)</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

/** The dashboard's AI agent card: the mascot in front of the house scene, with a buyer's question being answered underneath. */
function AgentScene({ lang }: { lang: Lang }) {
  return (
    <div className="mx-auto w-full max-w-[540px] overflow-hidden rounded-[2rem] border border-[var(--hero-line)] bg-white shadow-[var(--shadow-lift)] lg:mx-0 lg:justify-self-end">
      <div className="relative isolate aspect-[3/2] overflow-hidden bg-[var(--hero-wash)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static art */}
        <img src="/images/dashboard/house.webp" alt="" width={1600} height={893} loading="lazy" className="absolute inset-0 -z-10 size-full object-cover object-[38%_50%]" />
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
        <HeroChat lang={lang} />
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

function ChatFragment({ say }: { say: Say }) {
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-white p-4 text-sm" aria-hidden="true">
      <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-[#1565e6] px-3.5 py-2 text-white">{say("Is there a parking slot?", "May parking slot po ba?")}</p>
      <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-zinc-100 px-3.5 py-2 text-ink">{say("Yes, one slot is included in the price.", "Yes po, kasama na sa presyo ang isang slot.")}</p>
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
