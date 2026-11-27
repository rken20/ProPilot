"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { emailOwners } from "@/lib/billing-email";
import { str } from "@/lib/form";
import { siteOrigin } from "@/lib/site";
import { requireSuperAdmin } from "@/lib/superadmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function back(notice: string): never {
  revalidatePath("/admin/reports");
  redirect(`/admin/reports?notice=${notice}`);
}

/** Public pages that show a listing, after it comes down or goes back up. */
function refreshPublic(propertyId: string) {
  revalidatePath(`/l/${propertyId}`);
  revalidatePath("/properties");
  revalidatePath("/app", "layout");
}

/** Take a listing off public pages. The reason is shown to the seller and emailed to the business's owners. */
export async function takeDown(propertyId: string, form: FormData) {
  const { user, admin } = await requireSuperAdmin();
  const reason = str(form, "reason").trim().slice(0, 500);
  if (!UUID.test(propertyId)) back("failed");
  if (!reason) back("need-reason");
  const { error } = await admin.rpc("admin_take_down_listing", {
    p_property: propertyId,
    p_reason: reason,
    p_by: user.id,
  });
  if (error) {
    console.error("[admin] take down failed:", error.message);
    back("failed");
  }
  const { data: p } = await admin
    .from("properties")
    .select("name, business_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (p) {
    await emailOwners(
      admin,
      p.business_id as string,
      "Your listing's public page was taken down",
      [
        ["Listing", p.name as string],
        ["Reason", reason],
      ],
      {
        label: "Open the listing",
        url: `${siteOrigin() ?? "https://myhomeseller.ai"}/app/properties/${propertyId}`,
      },
    );
  }
  refreshPublic(propertyId);
  back("taken-down");
}

/** Close one report and leave the listing up. */
export async function dismissReport(reportId: string, form: FormData) {
  const { user, admin } = await requireSuperAdmin();
  if (!UUID.test(reportId)) back("failed");
  const { error } = await admin.rpc("admin_dismiss_report", {
    p_report: reportId,
    p_note: str(form, "note").trim().slice(0, 500) || null,
    p_by: user.id,
  });
  if (error) {
    console.error("[admin] dismiss report failed:", error.message);
    back("failed");
  }
  back("dismissed");
}

/** Put a listing that was taken down back on public pages. */
export async function restoreListing(propertyId: string) {
  const { user, admin } = await requireSuperAdmin();
  if (!UUID.test(propertyId)) back("failed");
  const { error } = await admin.rpc("admin_restore_listing", {
    p_property: propertyId,
    p_by: user.id,
  });
  if (error) {
    console.error("[admin] restore failed:", error.message);
    back("failed");
  }
  refreshPublic(propertyId);
  back("restored");
}
