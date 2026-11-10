import { safeNext } from "@/lib/form";
import { SignInForm } from "../forms";

const NOTICES: Record<string, string> = {
  "link-expired": "That link has expired or was already used. Log in, or request a new one.",
  "signed-out": "You've been signed out.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next) : undefined;
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice] : undefined;
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Log in</h1>
      <p className="mb-6 text-sm text-zinc-600">Welcome back to PropPilot AI.</p>
      <SignInForm next={next} notice={notice} />
    </>
  );
}
