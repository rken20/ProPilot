import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Alert, Card } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { BUSINESS_COOKIE, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  "invitation not found": "This invite link isn't valid. Ask for a new one.",
  "invitation already used": "This invite has already been used.",
  "invitation expired": "This invite has expired. Ask for a new one.",
  "invitation is for a different email address":
    "This invite was sent to a different email address. Log in with the invited email, or ask for a new invite.",
};

async function accept(token: string) {
  "use server";
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error || typeof data !== "string") {
    const key = Object.keys(ERRORS).find((k) => error?.message.includes(k)) ?? "invitation not found";
    redirect(`/invite/${token}?error=${encodeURIComponent(key)}`);
  }
  (await cookies()).set(BUSINESS_COOKIE, data, { httpOnly: true, sameSite: "lax", path: "/", secure: true });
  redirect("/app?notice=welcome");
}

export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Join a team on ProPilot</h1>
        <p className="text-sm text-zinc-600">
          You&apos;re signed in as <span className="font-medium text-zinc-900">{user.email}</span>. Accept to join the business
          that invited you.
        </p>
        {error ? <Alert>{error}</Alert> : null}
        <form action={accept.bind(null, token)}>
          <SubmitButton className="w-full" pendingText="Joining…">
            Accept invitation
          </SubmitButton>
        </form>
        <form action="/auth/signout" method="post" className="text-center">
          <button className="text-sm text-zinc-500 hover:text-zinc-800">Not you? Sign out</button>
        </form>
      </Card>
    </main>
  );
}
