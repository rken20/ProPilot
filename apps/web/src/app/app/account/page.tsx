import { revalidatePath } from "next/cache";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { str } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

async function saveProfile(form: FormData) {
  "use server";
  const user = await requireUser();
  const fullName = str(form, "fullName").trim().slice(0, 120);
  const phone = str(form, "phone").trim().slice(0, 30);
  const supabase = await createClient();
  await supabase.from("profiles").update({ full_name: fullName, phone: phone || null, updated_at: new Date().toISOString() }).eq("id", user.id);
  revalidatePath("/app/account");
}

export default async function AccountPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name, phone").eq("id", user.id).single();

  return (
    <>
      <PageHeader title="Account" description="Your personal details. Business settings are separate." />
      <Card className="max-w-xl">
        <form action={saveProfile} className="space-y-4">
          <Field label="Email" htmlFor="email" hint="Used to sign in. Changing it comes later in the beta.">
            <Input id="email" value={user.email ?? ""} readOnly disabled />
          </Field>
          <Field label="Full name" htmlFor="fullName">
            <Input id="fullName" name="fullName" defaultValue={profile?.full_name ?? ""} />
          </Field>
          <Field label="Mobile number" htmlFor="phone" hint="For hot-lead alerts later">
            <Input id="phone" name="phone" type="tel" defaultValue={profile?.phone ?? ""} placeholder="09XX XXX XXXX" />
          </Field>
          <SubmitButton pendingText="Saving…">Save</SubmitButton>
        </form>
      </Card>
      <Card className="mt-6 max-w-xl">
        <p className="font-medium">Password</p>
        <p className="mt-1 text-sm text-zinc-600">
          We&apos;ll email you a secure link to set a new one.{" "}
          <Link href="/forgot-password" className="text-brand-700">
            Change password
          </Link>
        </p>
      </Card>
    </>
  );
}
