import { appSay } from "@/lib/lang-server";
import { Avatar } from "@/components/avatar";
import { avatarUrl } from "@/lib/media";
import { redirect } from "next/navigation";
import { BUSINESS_ROLES, can, canAssignRole, type BusinessRole } from "@propilot/shared";
import { Badge, Card, IconTitle, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { getUser, requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { changeMemberRole, revokeInvitation, setMemberActive } from "./actions";
import { InviteForm } from "./invite-form";
import { BusinessLanguage } from "./business-language";
import { BusinessName } from "./business-name";

const ROLE_LABEL: Record<BusinessRole, string> = { owner: "Owner", admin: "Admin", agent: "Agent", marketing: "Marketing" };
const ROLE_HELP: Record<BusinessRole, [english: string, taglish: string]> = {
  owner: ["Everything, including billing", "Lahat, kasama ang billing"],
  admin: ["Manages listings, leads and team", "Nagma-manage ng listings, leads at team"],
  agent: ["Handles assigned leads and chats", "Humahawak ng naka-assign na leads at chats"],
  marketing: ["Creates and publishes content", "Gumagawa at nagpa-publish ng content"],
};

export default async function TeamPage() {
  const say = await appSay();
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
    ? await supabase.from("profiles").select("id, full_name, email, avatar_path").in("id", ids)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const assignable = BUSINESS_ROLES.filter((r) => r !== "owner" && canAssignRole(biz.role, r));
  const roleOptions = assignable.map((r) => ({ value: r, label: `${ROLE_LABEL[r]} · ${say(...ROLE_HELP[r])}` }));
  const invites = invitesRes.data ?? [];

  return (
    <>
      <PageHeader icon3d="team" tone="mint" title="Team" description={say("Who can work in this business, and what they can do.", "Sino ang pwedeng magtrabaho sa business na ito, at ano ang pwede nilang gawin.")} />

      {can(biz.role, "business.update") ? <BusinessName name={biz.businessName} /> : null}
      {can(biz.role, "business.update") ? <BusinessLanguage /> : null}

      {can(biz.role, "team.invite") ? (
        <Card className="mb-6">
          <IconTitle icon="wave" size={24} className="mb-4 font-medium">Invite someone</IconTitle>
          <InviteForm roles={roleOptions} />
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0!">
        <ul className="divide-y divide-zinc-100">
          {(members ?? []).map((m) => {
            const p = profileById.get(m.user_id);
            const role = m.role as BusinessRole;
            const isMe = m.user_id === me?.id;
            const manageable = !isMe && role !== "owner" && canAssignRole(biz.role, role) && can(biz.role, "team.changeRole");
            return (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={p?.full_name || p?.email || ""} url={avatarUrl(p?.avatar_path)} className="size-10 bg-grape-100 text-sm text-grape-700" />
                  <div className="min-w-0">
                  <p className="font-medium">
                    {p?.full_name || p?.email || "Team member"} {isMe ? <span className="text-sm font-normal text-zinc-500">(you)</span> : null}
                  </p>
                  <p className="truncate text-sm text-zinc-500">{p?.email}</p>
                  </div>
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
          <IconTitle icon="envelope" size={24} className="mb-3 mt-8 font-medium">Pending invitations</IconTitle>
          <Card className="overflow-hidden p-0!">
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
