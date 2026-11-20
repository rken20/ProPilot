import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Privacy policy · MyHomeSeller" };

const UPDATED = "20 November 2026";

/** Public privacy policy (also the URL registered with Meta and Google). */
export default function PrivacyPage() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL;
  return (
    <div className="min-h-svh bg-surface">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/" aria-label="MyHomeSeller home">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-24">
        <h1 className="font-display text-[2.6rem] leading-tight font-medium">Privacy policy</h1>
        <p className="mt-2 text-sm text-muted">Last updated {UPDATED}. MyHomeSeller is in beta in the Philippines.</p>

        <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-ink/90">
          <Section title="What MyHomeSeller is">
            <p>
              MyHomeSeller helps property owners, agents and brokers list properties, answer the people who ask about them
              and follow up. Each listing can have a public page where anyone can send an inquiry. This policy explains what personal data MyHomeSeller handles,
              why, and what you can do about it under the Data Privacy Act of 2012 (Republic Act 10173).
            </p>
          </Section>

          <Section title="What we collect">
            <ul className="list-disc space-y-2 pl-5">
              <li>Your account: name and email address.</li>
              <li>For businesses: your business name, team members and their roles, your listings and their photos.</li>
              <li>
                Inquiries sent from a listing&apos;s public page: your name, mobile number, email if you give it, preferred
                viewing date, budget note and message. They go only to the business that listed the property. You don&apos;t
                need an account to send one.
              </li>
              <li>
                If you tell us what you&apos;re looking for on an inquiry form (property type, budget, preferred areas, when
                you plan to buy and how you&apos;d pay): it goes to that business with your inquiry. If you also tick the box
                to get match emails, we save your email, name, property type, budget, areas and payment method, together
                with the wording you agreed to and when. We ask you to confirm from an email before using them.
              </li>
              <li>
                Visits to a listing&apos;s public page are counted per day, with no personal data. To stop spam, we keep a
                one-way scrambled form of your internet address for up to 2 days when you send an inquiry.
              </li>
              <li>
                If you connect Google: your Google email address and an encrypted token that lets MyHomeSeller use only the
                spreadsheet and calendar it creates.
              </li>
              <li>
                If you connect Facebook: the Pages you choose (their ID and name), an encrypted access token for each
                Page, and your app-specific Facebook user ID. We don&apos;t keep your personal Facebook login token.
              </li>
              <li>
                Messenger conversations with a business&apos;s Facebook Page, if that business switched on AI replies: the
                messages, your Messenger name if Facebook shares it, and any viewing details you give (name, mobile number,
                preferred date).
              </li>
              <li>
                For plan payments: the GCash reference number, the name on the GCash account used, the amount and the plan.
                We use these only to find and confirm the payment.
              </li>
              <li>
                For businesses: a sales pipeline of the people they&apos;re selling to, built from inquiries and chats with
                them or added by the team, with notes, stage, an AI lead score and which listings they may fit.
              </li>
            </ul>
          </Section>

          <Section title="How we use it">
            <ul className="list-disc space-y-2 pl-5">
              <li>To run your account and show you the right screens.</li>
              <li>To pass an inquiry to the business that listed the property, in the app and, if set up, by email.</li>
              <li>To answer questions about a listing using only that listing&apos;s details.</li>
              <li>
                Match emails, only if you asked for them and confirmed: an automatic check compares what you&apos;re looking
                for with public listings on MyHomeSeller and emails you the ones that fit, at most once a week. Listings from
                sellers on a paid plan are shown first. Sellers never see your preferences or contact details from this;
                a seller hears from you only if you send them an inquiry. Every email has a link that stops the emails and
                deletes your preferences straight away. Otherwise we delete them after 12 months.
              </li>
              <li>
                On Facebook, only when you ask: to read your Page&apos;s posts so you can turn one into a listing, and to
                publish a listing to your Page when someone on your team presses Post.
              </li>
              <li>
                On Messenger: to answer questions about the business&apos;s listings with an automated assistant, which says
                it&apos;s automated, and to pass the conversation to a person on the business&apos;s team when you ask or when it
                can&apos;t help. The team can read the conversation and reply.
              </li>
              <li>
                For a business&apos;s team: to score how ready each lead is (hot, warm or cold) from what the lead said and
                shared, to suggest which listings may fit them, and to suggest next steps. Scores and matches are only
                suggestions, are never based on personal traits, and are never shown to the people they&apos;re about. Nothing is sent to anyone until a person on the team approves it.
              </li>
              <li>To keep the service secure, for example limiting how often a feature can be used.</li>
            </ul>
            <p className="mt-3">We don&apos;t sell personal data and we don&apos;t use it for advertising.</p>
          </Section>

          <Section title="Who processes it for us">
            <ul className="list-disc space-y-2 pl-5">
              <li>Supabase: database, sign-in and photo storage (Tokyo region).</li>
              <li>Vercel: hosting the app (Tokyo region).</li>
              <li>Anthropic: the AI that answers listing questions and chats, reads pasted posts, writes listing text and scores leads. Lead scoring isn&apos;t sent names, phone numbers or emails.</li>
              <li>Google and Meta (Facebook): only if you connect them, for the features above.</li>
              <li>An email provider, if email alerts are switched on.</li>
            </ul>
          </Section>

          <Section title="How long we keep it">
            <ul className="list-disc space-y-2 pl-5">
              <li>Your account and listings: until you delete them or ask us to delete your account.</li>
              <li>Inquiries from public pages: with the business&apos;s leads, until the business deletes them.</li>
              <li>Messenger conversations: deleted 12 months after the last message.</li>
              <li>
                Match email preferences: until you stop the emails, or 12 months at most. If you never confirm from our
                email, they are deleted after 7 days.
              </li>
              <li>Pipeline leads that never got past the early stages, or were marked lost: deleted after 12 months with no activity.</li>
              <li>Google and Facebook tokens: until you disconnect, or remove MyHomeSeller in your Google or Facebook settings.</li>
            </ul>
          </Section>

          <Section title="Facebook data and how to delete it">
            <p>
              You can disconnect a Page any time under Integrations, which deletes its token. You can also remove MyHomeSeller
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
