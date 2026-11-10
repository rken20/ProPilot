import { redirect } from "next/navigation";
import { BUSINESS_ROLES, can, canAssignRole, type BusinessRole } from "@propilot/shared";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { getUser, requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { changeMemberRole, revokeInvitation, setMemberActive } from "./actions";
import { InviteForm } from "./invite-form";

const ROLE_LABEL: Record<BusinessRole, string> = { owner: "Owner", admin: "Admin", agent: "Agent", marketing: "Marketing" };
const ROLE_HELP: Record<BusinessRole, string> = {
  owner: "Everything, including billing",
  admin: "Manages listings, leads and team",
  agent: "Handles assigned leads and chats",
  marketing: "Creates and publishes content",
};

export default async function TeamPage() {
  const [biz, me] = await Promise.all([requireBusiness(), getUser()]);
  if (!can(biz.role, "team.view")) redirect("/app");
  const supabase = await createClient();

  const [{ data: members }, invitesRes] = await Promise.all([
    supabase.from("business_members").select("user_id, role, status, created_at").eq("business_id", biz.businessId).order("created_at"),
    can(biz.role, "team.invite")
      ? supabase
          .from("invitations")
          .select("id, email, role, expires_at")
          .eq("business_id", biz.businessId)
          .is("accepted_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; email: string; role: string; expires_at: string }> }),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const assignable = BUSINESS_ROLES.filter((r) => r !== "owner" && canAssignRole(biz.role, r));
  const roleOptions = assignable.map((r) => ({ value: r, label: `${ROLE_LABEL[r]} · ${ROLE_HELP[r]}` }));
  const invites = invitesRes.data ?? [];

  return (
    <>
      <PageHeader title="Team" description="Who can work in this business, and what they can do." />

      {can(biz.role, "team.invite") ? (
        <Card className="mb-6">
          <p className="mb-4 font-medium">Invite someone</p>
          <InviteForm roles={roleOptions} />
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-zinc-100">
          {(members ?? []).map((m) => {
            const p = profileById.get(m.user_id);
            const role = m.role as BusinessRole;
            const isMe = m.user_id === me?.id;
            const manageable = !isMe && role !== "owner" && canAssignRole(biz.role, role) && can(biz.role, "team.changeRole");
            return (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {p?.full_name || p?.email || "Team member"} {isMe ? <span className="text-sm font-normal text-zinc-500">(you)</span> : null}
                  </p>
                  <p className="truncate text-sm text-zinc-500">{p?.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {m.status === "deactivated" ? <Badge>Deactivated</Badge> : null}
                  {manageable ? (
                    <>
                      <form action={changeMemberRole.bind(null, m.user_id)} className="flex items-center gap-2">
                        <label htmlFor={`role-${m.user_id}`} className="sr-only">
                          Role
                        </label>
                        <select
                          id={`role-${m.user_id}`}
                          name="role"
                          defaultValue={role}
                          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
                        >
                          {assignable.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                        <SubmitButton variant="secondary" className="px-3 py-1.5" pendingText="…">
                          Update
                        </SubmitButton>
                      </form>
                      <form action={setMemberActive.bind(null, m.user_id, m.status === "deactivated")}>
                        <SubmitButton variant={m.status === "deactivated" ? "secondary" : "danger"} className="px-3 py-1.5" pendingText="…">
                          {m.status === "deactivated" ? "Reactivate" : "Deactivate"}
                        </SubmitButton>
                      </form>
                    </>
                  ) : (
                    <Badge tone={role === "owner" ? "brand" : "neutral"}>{ROLE_LABEL[role]}</Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {invites.length > 0 ? (
        <>
          <h2 className="mb-3 mt-8 font-medium">Pending invitations</h2>
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-zinc-100">
              {invites.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span>
                    {inv.email} · {ROLE_LABEL[inv.role as BusinessRole]}
                    <span className="text-zinc-500"> · expires {new Date(inv.expires_at).toLocaleDateString("en-PH")}</span>
                  </span>
                  <form action={revokeInvitation.bind(null, inv.id)}>
                    <SubmitButton variant="ghost" className="px-2 py-1" pendingText="…">
                      Revoke
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </>
  );
}
