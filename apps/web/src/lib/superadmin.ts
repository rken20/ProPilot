import "server-only";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Whether a user is a HomeFinder super admin (set in the database only; users can't set it themselves). */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin.from("profiles").select("is_superadmin").eq("id", userId).maybeSingle();
  return data?.is_superadmin === true;
}

/** For super-admin pages and actions. Anyone else gets a 404, so the page's existence isn't revealed. */
export async function requireSuperAdmin() {
  const user = await getUser();
  const admin = createAdminClient();
  if (!user || !admin || !(await isSuperAdmin(user.id))) notFound();
  return { user, admin };
}
