import { ForgotPasswordForm } from "../forms";

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-display mb-2 text-[2rem] leading-tight font-medium">Reset your password</h1>
      <p className="mb-6 text-sm text-zinc-600">Enter your email and we&apos;ll send you a reset link.</p>
      <ForgotPasswordForm />
    </>
  );
}
