"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BUSINESS_COOKIE, getMemberships } from "@/lib/auth";
import { str } from "@/lib/form";

/** Switch the business the user is working in. Only businesses they belong to. */
export async function switchBusiness(form: FormData) {
  const id = str(form, "businessId");
  const memberships = await getMemberships();
  if (memberships.some((m) => m.businessId === id)) {
    (await cookies()).set(BUSINESS_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", secure: true });
  }
  redirect("/app");
}
