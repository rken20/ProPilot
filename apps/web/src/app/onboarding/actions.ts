"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createBusinessSchema } from "@propilot/shared";
import { BUSINESS_COOKIE, requireUser } from "@/lib/auth";
import { fieldErrorsFrom, str, type FormState } from "@/lib/form";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function createBusiness(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const data = { name: str(form, "name"), type: str(form, "type") };
  const parsed = createBusinessSchema.safeParse(data);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), data };

  const supabase = await createClient();
  // create_business() creates the business and the owner membership in one transaction.
  const { data: id, error } = await supabase.rpc("create_business", {
    p_name: parsed.data.name,
    p_type: parsed.data.type,
  });
  if (error || typeof id !== "string") return { error: "Couldn't create the business. Please try again.", data };

  // A plan given to this person's email as a beta tester turns on now. Never blocks setting up.
  try {
    const { error: claimError } = (await createAdminClient()?.rpc("claim_plan_grants", { p_user: user.id })) ?? {};
    if (claimError) console.error("[billing] claim grants failed:", claimError.message);
  } catch (e) {
    console.error("[billing] claim grants failed:", e instanceof Error ? e.message : String(e));
  }

  (await cookies()).set(BUSINESS_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", secure: true });
  redirect("/app?notice=welcome");
}
