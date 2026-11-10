"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { BUSINESS_ROLES, can, canAssignRole, inviteMemberSchema, type BusinessRole } from "@proppilot/shared";
import { getOrigin, requireBusiness, requireUser } from "@/lib/auth";
import { fieldErrorsFrom, str, type FormState } from "@/lib/form";
import { createClient } from "@/lib/supabase/server";

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

  // The raw token only lives in the link; the database stores its SHA-256 hash.
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const supabase = await createClient();
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
  await supabase
    .from("business_members")
    .update({ status: active ? "active" : "deactivated" })
    .eq("business_id", biz.businessId)
    .eq("user_id", userId);
  revalidatePath("/app/team");
}
