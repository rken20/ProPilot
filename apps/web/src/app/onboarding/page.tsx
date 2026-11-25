import { siteLang } from "@/lib/lang-server";
import { sayIn } from "@/lib/lang";
import { LangProvider } from "@/components/lang";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getMemberships, requireUser } from "@/lib/auth";
import { CreateBusinessForm } from "./form";

export default async function OnboardingPage() {
  const user = await requireUser();
  const memberships = await getMemberships();
  if (memberships.length > 0) redirect("/app");

  const lang = await siteLang();
  const say = sayIn(lang);
  const firstName = String(user.user_metadata?.full_name ?? "").split(" ")[0];
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <h1 className="font-display text-[2rem] leading-tight font-medium">
          {firstName ? `Welcome, ${firstName}.` : "Welcome."} Set up your business
        </h1>
        <p className="mb-6 mt-1 text-sm text-zinc-600">
          {say("Your listings, leads and team live under this business. You'll be its owner.", "Dito mapupunta ang listings, leads at team mo. Ikaw ang magiging owner nito.")}
        </p>
        <LangProvider lang={lang}>
          <CreateBusinessForm />
        </LangProvider>
      </Card>
    </main>
  );
}
