import Link from "next/link";
import { Building2, House } from "lucide-react";
import { safeNext } from "@/lib/form";
import { SignUpForm } from "../forms";

const COPY = {
  buyer: { title: "Find your next home", sub: "Browse listings, ask questions any time, and book viewings." },
  agent: { title: "Set up PropPilot for your listings", sub: "Free during the beta. No card needed." },
} as const;

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next) : undefined;
  // Team invitations are always for agent accounts.
  const as = next?.startsWith("/invite/") ? "agent" : sp.as === "buyer" || sp.as === "agent" ? sp.as : undefined;
  const keep = next ? `&next=${encodeURIComponent(next)}` : "";

  if (!as) {
    return (
      <>
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="mb-6 text-sm text-muted">How will you use PropPilot?</p>
        <div className="space-y-3">
          <Choice
            href={`/signup?as=buyer${keep}`}
            icon={<House className="size-5" aria-hidden />}
            title="I'm looking for a property"
            text="Browse listings, save favorites and request viewings."
          />
          <Choice
            href={`/signup?as=agent${keep}`}
            icon={<Building2 className="size-5" aria-hidden />}
            title="I sell or manage properties"
            text="For agents, brokers and developers. List properties and handle buyer leads."
          />
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-brand-700">
            Log in
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">{COPY[as].title}</h1>
      <p className="mb-6 text-sm text-muted">
        {COPY[as].sub}{" "}
        {next?.startsWith("/invite/") ? null : (
          <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-brand-700">
            Change
          </Link>
        )}
      </p>
      <SignUpForm next={next} accountType={as} />
    </>
  );
}

function Choice({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 rounded-xl border border-line bg-white p-4 transition-colors hover:border-brand-600 hover:bg-brand-50/50"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{text}</span>
      </span>
    </Link>
  );
}
