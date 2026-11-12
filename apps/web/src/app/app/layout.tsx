import { can } from "@propilot/shared";
import { createClient } from "@/lib/supabase/server";
import { getMemberships, getUser, requireBusiness } from "@/lib/auth";
import { switchBusiness } from "./actions";
import type { NavItem } from "./nav";
import { AgentAssistant } from "./agent-assistant";
import { AppShell } from "./shell";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const current = await requireBusiness();
  const [memberships, user] = await Promise.all([getMemberships(), getUser()]);
  const fullName = String(user?.user_metadata?.full_name ?? "") || (user?.email ?? "");
  const sales = can(current.role, "lead.viewAll") || can(current.role, "lead.viewAssigned");
  // AI suggestions waiting for a decision, shown as a badge on "AI agents".
  const waiting = sales
    ? ((
        await (await createClient())
          .from("agent_tasks")
          .select("id", { count: "exact", head: true })
          .eq("business_id", current.businessId)
          .eq("status", "proposed")
      ).count ?? 0)
    : 0;

  const items: NavItem[] = [
    { href: "/app", label: "Dashboard", icon: "dashboard" },
    { href: "/app/properties", label: "Properties", icon: "properties" },
    ...(sales
      ? [
          { href: "/app/pipeline", label: "Pipeline", icon: "pipeline" as const },
          { href: "/app/agents", label: "AI agents", icon: "agents" as const, count: waiting },
          { href: "/app/leads", label: "Viewing requests", icon: "leads" as const },
        ]
      : []),
    ...(can(current.role, "conversation.reply")
      ? [{ href: "/app/inbox", label: "Messages", icon: "inbox" as const }]
      : []),
    ...(can(current.role, "analytics.view") ? [{ href: "/app/reports", label: "Reports", icon: "reports" as const }] : []),
    ...(can(current.role, "team.view") ? [{ href: "/app/team", label: "Team", icon: "team" as const }] : []),
    ...(can(current.role, "lead.viewAssigned") || can(current.role, "business.update")
      ? [{ href: "/app/integrations", label: "Integrations", icon: "integrations" as const }]
      : []),
    ...(can(current.role, "billing.view") ? [{ href: "/app/billing", label: "Billing", icon: "billing" as const, soon: true }] : []),
  ];

  return (
    <AppShell current={current} memberships={memberships} fullName={fullName} items={items} switchBusiness={switchBusiness}>
      {children}
      {process.env.ANTHROPIC_API_KEY ? <AgentAssistant /> : null}
    </AppShell>
  );
}
