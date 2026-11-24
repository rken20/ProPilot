"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { BUSINESS_ROLES, can, canAssignRole, inviteMemberSchema, type BusinessRole } from "@propilot/shared";
import { getOrigin, requireBusiness, requireUser } from "@/lib/auth";
import { fieldErrorsFrom, str, type FormState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";
import { businessPlan } from "@/lib/plan";
import { teamSeatsUsed } from "@/lib/plan-limits";

/** Rename the business. Its name shows in the app and as "listed by" on every public listing page. Owners and admins only (the database enforces it too). */
export async function renameBusiness(_prev: FormState, form: FormData): Promise<FormState> {
  const biz = await requireBusiness();
  const name = str(form, "businessName").replace(/\s+/g, " ").trim();
  if (!can(biz.role, "business.update")) return { error: "Only the owner or an admin can rename the business.", data: { businessName: name } };
  if (name.length < 2 || name.length > 120) return { fieldErrors: { businessName: "Use 2 to 120 characters." }, data: { businessName: name } };
  const supabase = await createClient();
  const { data, error } = await supabase.from("businesses").update({ name, updated_at: new Date().toISOString() }).eq("id", biz.businessId).select("id");
  if (error || !data?.length) return { error: "Couldn't save the name. Please try again.", data: { businessName: name } };
  revalidatePath("/app", "layout");
  return { ok: true, message: "Saved. Public listing pages show the new name now.", data: { businessName: name } };
}

export async function inviteMember(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const biz = await requireBusiness();
  if (!can(biz.role, "team.invite")) return { error: "Your role can't invite people." };

  const data = { email: str(form, "email"), role: str(form, "role") };
  const parsed = inviteMemberSchema.safeParse(data);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), data };
  if (parsed.data.role === "owner" || !canAssignRole(biz.role, parsed.data.role)) {
    return { fieldErrors: { role: "You can't invite someone with this role." }, data };
  }

  // The plan sets how many people a business can have (owner and open invitations included).
  const supabase = await createClient();
  const plan = await businessPlan(biz.businessId);
  if (plan.teamMembers !== null && (await teamSeatsUsed(supabase, biz.businessId)) >= plan.teamMembers) {
    return {
      error: `${plan.name} includes ${plan.teamMembers} team member${plan.teamMembers === 1 ? "" : "s"}. Remove someone or upgrade in Billing to invite more.`,
      data,
    };
  }

  // The raw token only lives in the link; the database stores its SHA-256 hash.
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { error } = await supabase.from("invitations").insert({
    business_id: biz.businessId,
    email: parsed.data.email,
    role: parsed.data.role,
    token_hash: tokenHash,
    invited_by: user.id,
  });
  if (error) return { error: "Couldn't create the invitation. Please try again.", data };

  revalidatePath("/app/team");
  return {
    ok: true,
    message: `Invite created for ${parsed.data.email}. Send them this link (valid 7 days):`,
    data: { link: `${await getOrigin()}/invite/${token}` },
  };
}

export async function revokeInvitation(id: string) {
  const biz = await requireBusiness();
  if (!can(biz.role, "team.invite")) return;
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", id).eq("business_id", biz.businessId);
  revalidatePath("/app/team");
}

export async function changeMemberRole(userId: string, form: FormData) {
  const biz = await requireBusiness();
  const role = str(form, "role") as BusinessRole;
  if (!can(biz.role, "team.changeRole") || !BUSINESS_ROLES.includes(role) || role === "owner") return;
  if (!canAssignRole(biz.role, role)) return;
  const supabase = await createClient();
  // RLS and the guard trigger re-check this in the database.
  await supabase.from("business_members").update({ role }).eq("business_id", biz.businessId).eq("user_id", userId);
  revalidatePath("/app/team");
}

export async function setMemberActive(userId: string, active: boolean) {
  const biz = await requireBusiness();
  if (!can(biz.role, "team.remove")) return;
  const supabase = await createClient();
  if (active) {
    const plan = await businessPlan(biz.businessId);
    if (plan.teamMembers !== null && (await teamSeatsUsed(supabase, biz.businessId)) >= plan.teamMembers) return;
  }
  await supabase
    .from("business_members")
    .update({ status: active ? "active" : "deactivated" })
    .eq("business_id", biz.businessId)
    .eq("user_id", userId);
  revalidatePath("/app/team");
}
