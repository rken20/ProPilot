import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getMemberships, getProfile, requireUser } from "@/lib/auth";
import { CreateBusinessForm } from "./form";

export default async function OnboardingPage() {
  const user = await requireUser();
  const memberships = await getMemberships();
  if (memberships.length > 0) redirect("/app");
  const profile = await getProfile();
  if (profile && !profile.account_type_chosen) redirect("/welcome");
  if (profile?.account_type === "buyer") redirect("/buyer");

  const firstName = String(user.user_metadata?.full_name ?? "").split(" ")[0];
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">
          {firstName ? `Welcome, ${firstName}.` : "Welcome."} Set up your business
        </h1>
        <p className="mb-6 mt-1 text-sm text-zinc-600">
          Your listings, leads and team live under this business. You&apos;ll be its owner.
        </p>
        <CreateBusinessForm />
      </Card>
    </main>
  );
}
