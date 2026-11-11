import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Data deletion status · ProPilot AI" };

/** Where Meta sends people to check a Facebook data deletion request. */
export default async function DeletionStatus({ searchParams }: PageProps<"/privacy/deletion">) {
  const sp = await searchParams;
  const code = typeof sp.code === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(sp.code) ? sp.code : null;
  const admin = createAdminClient();
  const row =
    code && admin
      ? (await admin.from("meta_deletion_requests").select("created_at").eq("confirmation_code", code).maybeSingle()).data
      : null;

  return (
    <div className="min-h-svh bg-surface">
      <header className="mx-auto max-w-2xl px-6 py-6">
        <Link href="/" aria-label="ProPilot AI home">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-6 pb-24">
        <h1 className="font-display text-[2.4rem] leading-tight font-medium">Facebook data deletion</h1>
        <div className="mt-6 rounded-2xl border border-line bg-white p-6 text-[15px] shadow-[var(--shadow-card)]">
          {row ? (
            <p>
              Done. Request <span className="font-mono text-sm">{code}</span> was completed on{" "}
              {new Date(row.created_at as string).toLocaleDateString("en-PH", { dateStyle: "long", timeZone: "Asia/Manila" })}:
              every Facebook Page token you had connected to ProPilot was deleted.
            </p>
          ) : (
            <p>We couldn&apos;t find that confirmation code. Check the link Facebook gave you, or see our privacy policy.</p>
          )}
        </div>
        <Link href="/privacy" className="mt-6 inline-block text-sm font-medium text-brand-700 underline underline-offset-2">
          Privacy policy
        </Link>
      </main>
    </div>
  );
}
