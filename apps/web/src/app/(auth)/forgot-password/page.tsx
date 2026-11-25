import { siteSay } from "@/lib/lang-server";
import { ForgotPasswordForm } from "../forms";

export default async function ForgotPasswordPage() {
  const say = await siteSay();
  return (
    <>
      <h1 className="font-display mb-2 text-[2rem] leading-tight font-medium">Reset your password</h1>
      <p className="mb-6 text-sm text-zinc-600">{say("Enter your email and we'll send you a reset link.", "Ilagay ang email mo at padadalhan ka namin ng reset link.")}</p>
      <ForgotPasswordForm />
    </>
  );
}
