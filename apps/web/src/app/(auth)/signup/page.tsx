import { safeNext } from "@/lib/form";
import { SignUpForm } from "../forms";

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next, "/onboarding") : undefined;
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mb-6 text-sm text-zinc-600">Free during the beta. No card needed.</p>
      <SignUpForm next={next} />
    </>
  );
}
