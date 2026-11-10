import { ForgotPasswordForm } from "../forms";

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mb-6 text-sm text-zinc-600">Enter your email and we&apos;ll send you a reset link.</p>
      <ForgotPasswordForm />
    </>
  );
}
