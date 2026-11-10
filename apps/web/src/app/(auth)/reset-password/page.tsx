import { requireUser } from "@/lib/auth";
import { ResetPasswordForm } from "../forms";

export default async function ResetPasswordPage() {
  // The reset link signs the user in via /auth/callback before landing here.
  await requireUser();
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mb-6 text-sm text-zinc-600">You&apos;ll stay signed in after saving.</p>
      <ResetPasswordForm />
    </>
  );
}
