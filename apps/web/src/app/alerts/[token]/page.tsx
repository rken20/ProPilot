import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { SubmitButton } from "@/components/submit-button";
import { EMAIL_EVERY_DAYS } from "@/lib/match-alert-rules";
import { alertFor } from "@/lib/match-alerts";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmMatchEmails, stopMatchEmails } from "./actions";

export const metadata: Metadata = { title: "Your property match emails · MyHomeSeller", robots: { index: false, follow: false } };

/** Where a buyer confirms, checks or stops their match emails. Opened from a link in an email; no account. */
export default async function AlertPage({ params, searchParams }: PageProps<"/alerts/[token]">) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const key = decodeURIComponent(token);
  const admin = createAdminClient();
  const alert = admin ? await alertFor(admin, key) : null;
  const deleted = sp.deleted === "1";

  return (
    <div className="min-h-svh bg-surface">
      <header className="mx-auto max-w-2xl px-6 py-6">
        <Link href="/" aria-label="MyHomeSeller home">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-6 pb-24">
        <h1 className="text-[2rem] leading-tight font-extrabold tracking-tight">Your property match emails</h1>
        <div className="mt-6 rounded-[1.5rem] border border-line bg-white p-6 text-[15px] shadow-[var(--shadow-card)]">
          {alert ? (
            <>
              <p className="font-semibold">
                {alert.confirmed
                  ? `Match emails are on for ${alert.email}.`
                  : `Confirm that you want match emails at ${alert.email}. Nothing is sent until you do.`}
              </p>
              <h2 className="mt-5 text-sm font-bold">What you&apos;re looking for</h2>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink/85">
                {alert.summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-muted">
                When a listing on MyHomeSeller fits, we email it to you, at most once every {EMAIL_EVERY_DAYS} days. Sellers don&apos;t get your details unless you
                send them an inquiry. We keep these preferences for 12 months, or until you stop.{" "}
                <Link href="/privacy" className="font-semibold text-grape-700 hover:underline">
                  Privacy policy
                </Link>
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {alert.confirmed ? null : (
                  <form action={confirmMatchEmails.bind(null, key)}>
                    <SubmitButton pendingText="Confirming…">Yes, email me matches</SubmitButton>
                  </form>
                )}
                <form action={stopMatchEmails.bind(null, key)}>
                  <SubmitButton variant="secondary" pendingText="Deleting…">
                    {alert.confirmed ? "Stop emails and delete my preferences" : "No, delete this"}
                  </SubmitButton>
                </form>
              </div>
            </>
          ) : deleted ? (
            <p>Done. Your preferences are deleted and you won&apos;t get match emails. Inquiries you already sent stay with the sellers you sent them to.</p>
          ) : (
            <p>This link isn&apos;t valid any more. If you stopped your match emails, your preferences are already deleted.</p>
          )}
        </div>
      </main>
    </div>
  );
}
