import { siteSay } from "@/lib/lang-server";
import { requireUser } from "@/lib/auth";
import { ResetPasswordForm } from "../forms";

export default async function ResetPasswordPage() {
  // The reset link signs the user in via /auth/callback before landing here.
  await requireUser();
  const say = await siteSay();
  return (
    <>
      <h1 className="font-display mb-2 text-[2rem] leading-tight font-medium">Choose a new password</h1>
      <p className="mb-6 text-sm text-zinc-600">{say("You'll stay signed in after saving.", "Naka-sign in ka pa rin pagkatapos mag-save.")}</p>
      <ResetPasswordForm />
    </>
  );
}
