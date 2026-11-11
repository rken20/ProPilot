import { safeNext } from "@/lib/form";
import { GoogleButton } from "@/components/google-button";
import { SignInForm } from "../forms";

const NOTICES: Record<string, string> = {
  "link-expired": "That link has expired or was already used. Log in, or request a new one.",
  "signed-out": "You've been signed out.",
  "google-unavailable": "Google sign-in isn't available right now. Log in with your email instead.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next) : undefined;
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice] : undefined;
  return (
    <>
      <h1 className="font-display mb-2 text-[2rem] leading-tight font-medium">Log in</h1>
      <p className="mb-6 text-sm text-zinc-600">Welcome back to ProPilot AI.</p>
      <GoogleButton next={next} />
      <SignInForm next={next} notice={notice} />
    </>
  );
}
