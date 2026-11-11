import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Privacy policy · ProPilot AI" };

const UPDATED = "11 November 2026";

/** Public privacy policy (also the URL registered with Meta and Google). */
export default function PrivacyPage() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL;
  return (
    <div className="min-h-svh bg-surface">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/" aria-label="ProPilot AI home">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-24">
        <h1 className="font-display text-[2.6rem] leading-tight font-medium">Privacy policy</h1>
        <p className="mt-2 text-sm text-muted">Last updated {UPDATED}. ProPilot AI is in beta in the Philippines.</p>

        <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-ink/90">
          <Section title="What ProPilot is">
            <p>
              ProPilot AI helps real estate agents and brokers list properties and answer buyers, and helps buyers find
              properties, ask about them and request viewings. This policy explains what personal data ProPilot handles,
              why, and what you can do about it under the Data Privacy Act of 2012 (Republic Act 10173).
            </p>
          </Section>

          <Section title="What we collect">
            <ul className="list-disc space-y-2 pl-5">
              <li>Your account: name, email address, and whether you joined as a buyer or an agent.</li>
              <li>For agents: your business name, team members and their roles, your listings and their photos.</li>
              <li>
                For buyers: the listings you save, the questions you ask the listing assistant, and viewing requests (your
                name, mobile number, preferred date and message), which go to the agent of that listing.
              </li>
              <li>
                If you connect Google: your Google email address and an encrypted token that lets ProPilot use only the
                spreadsheet and calendar it creates.
              </li>
              <li>
                If you connect Facebook: the Pages you choose (their ID and name), an encrypted access token for each
                Page, and your app-specific Facebook user ID. We don&apos;t keep your personal Facebook login token.
              </li>
              <li>
                Listings found on other property sites: the listing&apos;s facts (title, price, location, type, size) and
                a link to the original page. We don&apos;t store their photos or the seller&apos;s contact details.
              </li>
            </ul>
          </Section>

          <Section title="How we use it">
            <ul className="list-disc space-y-2 pl-5">
              <li>To run your account and show you the right screens.</li>
              <li>To pass a buyer&apos;s viewing request to the listing&apos;s agent, by app and, if set up, by email.</li>
              <li>To answer questions about a listing using only that listing&apos;s details.</li>
              <li>
                On Facebook, only when you ask: to read your Page&apos;s posts so you can turn one into a listing, and to
                publish a listing to your Page when someone on your team presses Post.
              </li>
              <li>To keep the service secure, for example limiting how often a feature can be used.</li>
            </ul>
            <p className="mt-3">We don&apos;t sell personal data and we don&apos;t use it for advertising.</p>
          </Section>

          <Section title="Who processes it for us">
            <ul className="list-disc space-y-2 pl-5">
              <li>Supabase: database, sign-in and photo storage (Singapore region).</li>
              <li>Vercel: hosting the app.</li>
              <li>Anthropic: the AI that answers listing questions, reads pasted posts and searches property sites.</li>
              <li>Google and Meta (Facebook): only if you connect them, for the features above.</li>
              <li>An email provider, if email alerts are switched on.</li>
            </ul>
          </Section>

          <Section title="How long we keep it">
            <ul className="list-disc space-y-2 pl-5">
              <li>Your account and listings: until you delete them or ask us to delete your account.</li>
              <li>Listings from other sites: 30 days after last seen, unless a buyer saved them. Search results: 7 days.</li>
              <li>Google and Facebook tokens: until you disconnect, or remove ProPilot in your Google or Facebook settings.</li>
            </ul>
          </Section>

          <Section title="Facebook data and how to delete it">
            <p>
              You can disconnect a Page any time under Integrations, which deletes its token. You can also remove ProPilot
              AI in Facebook under Settings and privacy, then Settings, then Business integrations (or Apps and websites).
              When you do and ask for your data to be deleted, Facebook tells us and we delete every Page token you
              connected. You&apos;ll get a confirmation code you can check on our deletion status page.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              You can ask to see, correct or delete your personal data, object to how we use it, or get a copy of it.{" "}
              {contact ? (
                <>
                  Email{" "}
                  <a href={`mailto:${contact}`} className="font-medium text-brand-700 underline underline-offset-2">
                    {contact}
                  </a>
                  .
                </>
              ) : (
                "Contact us through your Account page in the app."
              )}{" "}
              You can also complain to the National Privacy Commission (privacy.gov.ph).
            </p>
          </Section>

          <Section title="Security">
            <p>
              Data is encrypted in transit. Google and Facebook tokens are encrypted again before they&apos;re stored, and
              every table checks who is asking before it returns anything, so one business can&apos;t see another&apos;s
              data.
            </p>
          </Section>

          <Section title="Changes">
            <p>If we change this policy, we&apos;ll update the date at the top and tell signed-in users about big changes.</p>
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-2xl font-medium text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
