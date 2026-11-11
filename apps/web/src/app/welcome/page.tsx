import { redirect } from "next/navigation";
import { Building2, House } from "lucide-react";
import { Logo } from "@/components/logo";
import { getProfile, homePathFor, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function choose(type: "buyer" | "agent") {
  "use server";
  await requireUser();
  const supabase = await createClient();
  await supabase.rpc("choose_account_type", { p_type: type });
  redirect(type === "buyer" ? "/buyer" : "/onboarding");
}

/** Shown once to people who signed in with Google without choosing buyer or agent. */
export default async function WelcomePage() {
  await requireUser();
  const profile = await getProfile();
  if (profile?.account_type_chosen) redirect(await homePathFor());
  const first = (profile?.full_name ?? "").split(" ")[0];

  const option =
    "flex w-full items-start gap-4 rounded-xl border border-line bg-white p-5 text-left transition-colors hover:border-brand-600 hover:bg-brand-50/50";
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Logo />
        <h1 className="font-display mt-8 text-[2rem] leading-tight font-medium">{first ? `Welcome, ${first}.` : "Welcome."} How will you use ProPilot?</h1>
        <p className="mt-1 text-sm text-muted">You only need to choose once.</p>
        <div className="mt-6 space-y-3">
          <form action={choose.bind(null, "buyer")}>
            <button className={option}>
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <House className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-semibold">I&apos;m looking for a property</span>
                <span className="mt-0.5 block text-sm text-muted">Search listings, ask questions and request viewings.</span>
              </span>
            </button>
          </form>
          <form action={choose.bind(null, "agent")}>
            <button className={option}>
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <Building2 className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-semibold">I sell or manage properties</span>
                <span className="mt-0.5 block text-sm text-muted">For agents, brokers and developers.</span>
              </span>
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
