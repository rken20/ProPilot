import { siteSay } from "@/lib/lang-server";
import { safeNext } from "@/lib/form";
import { GoogleButton } from "@/components/google-button";
import { SignInForm } from "../forms";

const NOTICES: Record<string, [english: string, taglish: string]> = {
  "link-expired": ["That link has expired or was already used. Log in, or request a new one.", "Expired na o nagamit na ang link na iyon. Mag-log in, o mag-request ng bago."],
  "signed-out": ["You've been signed out.", "Naka-sign out ka na."],
  "google-unavailable": ["Google sign-in isn't available right now. Log in with your email instead.", "Hindi available ang Google sign-in ngayon. Mag-log in na lang gamit ang email mo."],
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next) : undefined;
  const say = await siteSay();
  const pair = typeof sp.notice === "string" ? NOTICES[sp.notice] : undefined;
  const notice = pair ? say(...pair) : undefined;
  return (
    <>
      <h1 className="font-display mb-2 text-[2rem] leading-tight font-medium">Log in</h1>
      <p className="mb-6 text-sm text-zinc-600">{say("Welcome back to MyHomeSeller.", "Welcome back sa MyHomeSeller.")}</p>
      <GoogleButton next={next} />
      <SignInForm next={next} notice={notice} />
    </>
  );
}
