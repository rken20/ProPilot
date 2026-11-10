"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createBusinessSchema } from "@propilot/shared";
import { BUSINESS_COOKIE, requireUser } from "@/lib/auth";
import { fieldErrorsFrom, str, type FormState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";

export async function createBusiness(_prev: FormState, form: FormData): Promise<FormState> {
  await requireUser();
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

  (await cookies()).set(BUSINESS_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", secure: true });
  redirect("/app?notice=welcome");
}
