import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { AccountType, BusinessRole } from "@propilot/shared";
import { createClient } from "@/lib/supabase/server";

export const BUSINESS_COOKIE = "pp_business";

export type Membership = {
  businessId: string;
  businessName: string;
  role: BusinessRole;
};

/** The signed-in user, verified with Supabase (not just read from the cookie). */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** The signed-in user's profile (name, phone, buyer or agent). */
export const getProfile = cache(async () => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const full = await supabase
    .from("profiles")
    .select("full_name, phone, email, account_type, account_type_chosen")
    .eq("id", user.id)
    .maybeSingle();
  let data = full.data as Profile | null;
  if (full.error) {
    // Database not yet updated with account_type_chosen: treat everyone as having chosen.
    const basic = await supabase.from("profiles").select("full_name, phone, email, account_type").eq("id", user.id).maybeSingle();
    data = basic.data ? ({ ...basic.data, account_type_chosen: true } as Profile) : null;
  }
  return data;
});

type Profile = { full_name: string; phone: string | null; email: string | null; account_type: AccountType; account_type_chosen: boolean };

/** Where a signed-in person belongs: buyers browse, agents work in their business. */
export async function homePathFor(): Promise<string> {
  const profile = await getProfile();
  const hasBusiness = (await getMemberships()).length > 0;
  if (hasBusiness) return "/app";
  if (profile && !profile.account_type_chosen) return "/welcome";
  return profile?.account_type === "buyer" ? "/buyer" : "/onboarding";
}

/** Businesses the current user is an active member of. RLS returns only theirs. */
export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .select("business_id, role, businesses(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((m) => ({
    businessId: m.business_id as string,
    role: m.role as BusinessRole,
    businessName: (m.businesses as unknown as { name: string } | null)?.name ?? "Business",
  }));
});

/**
 * The business the user is working in: the one remembered in a cookie if they
 * still belong to it, otherwise their first. Sends them to onboarding if none.
 */
export const requireBusiness = cache(async (): Promise<Membership> => {
  await requireUser();
  const memberships = await getMemberships();
  if (memberships.length === 0) {
    const profile = await getProfile();
    if (profile && !profile.account_type_chosen) redirect("/welcome");
    redirect(profile?.account_type === "buyer" ? "/buyer" : "/onboarding");
  }
  const chosen = (await cookies()).get(BUSINESS_COOKIE)?.value;
  return memberships.find((m) => m.businessId === chosen) ?? memberships[0]!;
});

/**
 * The app's public address for links in emails and invites. APP_ORIGIN pins it
 * (so a forged Host header can't put another site in a link); otherwise it
 * comes from the request.
 */
export async function getOrigin(): Promise<string> {
  const pinned = process.env.APP_ORIGIN?.replace(/\/$/, "");
  if (pinned) return pinned;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
