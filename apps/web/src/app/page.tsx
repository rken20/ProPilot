import { env } from "@/lib/env";

export default function Home() {
  const configured = env.isConfigured();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-emerald-700">Beta · in development</p>
      <h1 className="text-4xl font-semibold tracking-tight">ProPilot AI</h1>
      <p className="text-lg text-zinc-600">
        Your AI assistant for real estate: answer Messenger inquiries from your own listings, qualify buyers, and
        never miss a hot lead.
      </p>
      {configured ? (
        <p className="text-zinc-700">Backend connected. Sign-up and login arrive in the next build.</p>
      ) : (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <p className="font-medium">Supabase isn&apos;t connected yet.</p>
          <p className="text-sm">
            Copy <code>.env.example</code> to <code>.env.local</code> and add your Supabase project URL and anon key.
          </p>
        </div>
      )}
    </main>
  );
}
