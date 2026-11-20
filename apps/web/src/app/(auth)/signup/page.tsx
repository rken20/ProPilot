import { GoogleButton } from "@/components/google-button";
import { safeNext } from "@/lib/form";
import { SignUpForm } from "../forms";

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next) : undefined;
  return (
    <>
      <h1 className="font-display mb-2 text-[2rem] leading-tight font-medium">Create your account</h1>
      <p className="mb-6 text-sm text-muted">For property owners and agents. Start free, no card needed.</p>
      <GoogleButton next={next} />
      <SignUpForm next={next} />
    </>
  );
}
