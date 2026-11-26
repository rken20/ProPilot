import { appSay } from "@/lib/lang-server";
import { revalidatePath } from "next/cache";
import { Card, Field, IconTitle, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { str } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { InstallCard } from "@/components/install-app";
import { ThemeToggle } from "@/components/theme-toggle";
import { avatarUrl } from "@/lib/media";
import { AvatarEditor } from "./avatar-editor";

async function saveProfile(form: FormData) {
  "use server";
  const user = await requireUser();
  const fullName = str(form, "fullName").trim().slice(0, 120);
  const phone = str(form, "phone").trim().slice(0, 30);
  const supabase = await createClient();
  await supabase.from("profiles").update({ full_name: fullName, phone: phone || null, updated_at: new Date().toISOString() }).eq("id", user.id);
  revalidatePath("/app", "layout");
}

export default async function AccountPage() {
  const say = await appSay();
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name, phone, avatar_path").eq("id", user.id).single();

  return (
    <>
      <PageHeader icon3d="gear" tone="sky" title="Account" description={say("Your personal details. Business settings are separate.", "Personal details mo ito. Hiwalay ang business settings.")} />
      <Card className="mb-6 max-w-xl">
        <AvatarEditor userId={user.id} name={profile?.full_name || user.email || ""} url={avatarUrl(profile?.avatar_path)} />
      </Card>
      <Card className="max-w-xl">
        <form action={saveProfile} className="space-y-4">
          <Field label="Email" htmlFor="email" hint={say("Used to sign in. Changing it comes later in the beta.", "Ito ang gamit sa pag-sign in. Sa susunod pa ito mapapalitan.")}>
            <Input id="email" value={user.email ?? ""} readOnly disabled />
          </Field>
          <Field label="Full name" htmlFor="fullName">
            <Input id="fullName" name="fullName" defaultValue={profile?.full_name ?? ""} />
          </Field>
          <Field label="Mobile number" htmlFor="phone" hint={say("For hot-lead alerts later", "Para sa hot-lead alerts sa susunod")}>
            <Input id="phone" name="phone" type="tel" defaultValue={profile?.phone ?? ""} placeholder="09XX XXX XXXX" />
          </Field>
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
        </form>
      </Card>
      <Card className="mt-6 max-w-xl">
        <IconTitle icon="key" size={24} className="font-medium">Password</IconTitle>
        <p className="mt-1 text-sm text-zinc-600">
          We&apos;ll email you a secure link to set a new one.{" "}
          <Link href="/forgot-password" className="text-brand-700">
            Change password
          </Link>
        </p>
      </Card>
      <InstallCard className="mt-6 max-w-xl" />
      {/* On computers these two live in the sidebar. */}
      <Card className="mt-6 flex max-w-xl flex-wrap items-center justify-between gap-4 lg:hidden">
        <ThemeToggle className="text-sm font-medium text-ink" />
        <form action="/auth/signout" method="post">
          <button className="flex items-center gap-2 text-sm font-medium text-hot">
            <LogOut className="size-4" aria-hidden /> Sign out
          </button>
        </form>
      </Card>
    </>
  );
}
