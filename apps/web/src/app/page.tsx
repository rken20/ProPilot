import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { env } from "@/lib/env";

export default async function Home() {
  if (env.isConfigured() && (await getUser())) redirect("/app");
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-brand-700">Beta · Philippines</p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Every inquiry answered.
        <br />
        Every hot lead on your phone.
      </h1>
      <p className="max-w-xl text-lg text-zinc-600">
        PropPilot AI answers Messenger questions from your own listings, qualifies buyers, and hands you the ones ready
        for a viewing.
      </p>
      {env.isConfigured() ? (
        <div className="flex gap-3">
          <Link href="/signup" className={buttonClass()}>
            Create free account
          </Link>
          <Link href="/login" className={buttonClass("secondary")}>
            Log in
          </Link>
        </div>
      ) : (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Supabase isn&apos;t connected yet. Set the environment variables listed in <code>.env.example</code>.
        </p>
      )}
    </main>
  );
}
