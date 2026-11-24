"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validUntil } from "@/lib/admin-accounts";
import { str } from "@/lib/form";
import { AVATAR_BUCKET, MEDIA_BUCKET } from "@/lib/media";
import { requireSuperAdmin } from "@/lib/superadmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLANS = ["free", "basic", "pro", "agency"];

/** Back to the list, keeping the search, with a notice saying what happened. */
function back(form: FormData, notice: string): never {
  const q = str(form, "q").slice(0, 100);
  revalidatePath("/admin/accounts");
  redirect(
    `/admin/accounts?${new URLSearchParams({ ...(q ? { q } : {}), notice }).toString()}`,
  );
}

/** Put a business on a plan until a date, or back on Free. Nothing is charged. */
export async function setPlan(businessId: string, form: FormData) {
  const { user, admin } = await requireSuperAdmin();
  const plan = str(form, "plan");
  const until = str(form, "until");
  if (!UUID.test(businessId) || !PLANS.includes(plan))
    back(form, "plan-failed");
  if (plan !== "free" && !validUntil(until, new Date())) back(form, "bad-date");
  const { error } = await admin.rpc("admin_set_plan", {
    p_business: businessId,
    p_plan_code: plan,
    p_until: plan === "free" ? null : until,
    p_by: user.id,
  });
  if (error) {
    console.error("[admin] set plan failed:", error.message);
    back(form, "plan-failed");
  }
  revalidatePath("/app", "layout");
  back(form, "plan-saved");
}

/** Restrict an account, or lift the restriction. */
export async function setRestricted(
  userId: string,
  restricted: boolean,
  form: FormData,
) {
  const { user, admin } = await requireSuperAdmin();
  if (!UUID.test(userId) || userId === user.id) back(form, "not-allowed");
  const { error } = await admin.rpc("admin_set_restricted", {
    p_user: userId,
    p_restricted: restricted,
    p_by: user.id,
  });
  if (error) {
    console.error("[admin] restrict failed:", error.message);
    back(
      form,
      /super admin|your own/.test(error.message)
        ? "not-allowed"
        : "restrict-failed",
    );
  }
  // Their public listing pages come down, or go back up.
  revalidatePath("/l/[id]", "page");
  revalidatePath("/app", "layout");
  back(form, restricted ? "restricted" : "unrestricted");
}

/** Every photo file of the businesses about to be deleted. The API returns 1,000 rows at a time. */
async function mediaFiles(
  admin: SupabaseClient,
  businessIds: string[],
): Promise<string[]> {
  const files: string[] = [];
  if (!businessIds.length) return files;
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await admin
      .from("property_media")
      .select("storage_path, thumb_path")
      .in("business_id", businessIds)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const m of data ?? [])
      for (const f of [m.storage_path, m.thumb_path])
        if (typeof f === "string" && f) files.push(f);
    if ((data?.length ?? 0) < 1000) break;
  }
  return files;
}

/** Remove files from a bucket, a hundred at a time. Returns false if any batch failed. */
async function removeFiles(
  admin: SupabaseClient,
  bucket: string,
  files: string[],
): Promise<boolean> {
  let ok = true;
  for (let i = 0; i < files.length; i += 100) {
    const { error } = await admin.storage
      .from(bucket)
      .remove(files.slice(i, i + 100));
    if (error) {
      ok = false;
      console.error("[admin] removing files failed:", error.message);
    }
  }
  return ok;
}

/**
 * Delete an account for good: the businesses only this person owns (with their
 * listings, photos, leads and messages), their membership of other businesses,
 * their profile and their sign-in. The admin types the account's email first.
 */
export async function deleteAccount(userId: string, form: FormData) {
  const { user, admin } = await requireSuperAdmin();
  if (!UUID.test(userId) || userId === user.id) back(form, "not-allowed");

  const { data: target } = await admin.auth.admin.getUserById(userId);
  const email = target?.user?.email?.toLowerCase();
  if (!email || str(form, "confirm").trim().toLowerCase() !== email)
    back(form, "email-mismatch");

  // Read what to remove from storage before the records that name the files are gone.
  let files: string[] = [];
  let avatar: string | null = null;
  try {
    const { data: doomed, error } = await admin.rpc(
      "admin_account_businesses",
      { p_user: userId, p_by: user.id },
    );
    if (error) throw new Error(error.message);
    files = await mediaFiles(
      admin,
      ((doomed ?? []) as Array<{ business_id: string }>).map(
        (d) => d.business_id,
      ),
    );
    avatar =
      ((
        await admin
          .from("profiles")
          .select("avatar_path")
          .eq("id", userId)
          .maybeSingle()
      ).data?.avatar_path as string | null) ?? null;
  } catch (e) {
    console.error(
      "[admin] delete account, reading files failed:",
      e instanceof Error ? e.message : String(e),
    );
    back(form, "delete-failed");
  }

  const { error } = await admin.rpc("admin_delete_account", {
    p_user: userId,
    p_by: user.id,
  });
  if (error) {
    console.error("[admin] delete account failed:", error.message);
    back(
      form,
      /super admin|your own/.test(error.message)
        ? "not-allowed"
        : "delete-failed",
    );
  }

  const filesGone =
    (await removeFiles(admin, MEDIA_BUCKET, files)) &&
    (avatar ? await removeFiles(admin, AVATAR_BUCKET, [avatar]) : true);
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  revalidatePath("/l/[id]", "page");
  revalidatePath("/app", "layout");
  if (authError) {
    console.error("[admin] delete sign-in failed:", authError.message);
    back(form, "signin-left");
  }
  back(form, filesGone ? "deleted" : "files-left");
}
