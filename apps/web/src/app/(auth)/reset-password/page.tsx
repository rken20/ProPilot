import { requireUser } from "@/lib/auth";
import { ResetPasswordForm } from "../forms";

export default async function ResetPasswordPage() {
  // The reset link signs the user in via /auth/callback before landing here.
  await requireUser();
  return (
    <>
      <h1 className="font-display mb-2 text-[2rem] leading-tight font-medium">Choose a new password</h1>
      <p className="mb-6 text-sm text-zinc-600">You&apos;ll stay signed in after saving.</p>
      <ResetPasswordForm />
    </>
  );
}
