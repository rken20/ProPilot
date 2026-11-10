import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { BusinessRole } from "@propilot/shared";
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
  if (memberships.length === 0) redirect("/onboarding");
  const chosen = (await cookies()).get(BUSINESS_COOKIE)?.value;
  return memberships.find((m) => m.businessId === chosen) ?? memberships[0]!;
});

/** Absolute origin of this request, for auth email redirect links. */
export async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
