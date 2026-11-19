import { can } from "@propilot/shared";
import { createClient } from "@/lib/supabase/server";
import { getMemberships, getUser, requireBusiness } from "@/lib/auth";
import { switchBusiness } from "./actions";
import type { NavItem } from "./nav";
import { SectionTabs, type SectionTab } from "./section-tabs";
import { AgentAssistant } from "./agent-assistant";
import { AppShell } from "./shell";
import { aiEnabled } from "@/lib/plan";
import { isSuperAdmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const current = await requireBusiness();
  const [memberships, user] = await Promise.all([getMemberships(), getUser()]);
  const fullName = String(user?.user_metadata?.full_name ?? "") || (user?.email ?? "");
  const sales = can(current.role, "lead.viewAll") || can(current.role, "lead.viewAssigned");
  // AI suggestions waiting for a decision, shown as a badge on Pipeline and its "AI agents" tab.
  const waiting = sales
    ? ((
        await (await createClient())
          .from("agent_tasks")
          .select("id", { count: "exact", head: true })
          .eq("business_id", current.businessId)
          .eq("status", "proposed")
      ).count ?? 0)
    : 0;

  const superAdmin = user ? await isSuperAdmin(user.id) : false;
  const paymentsWaiting = superAdmin ? await pendingPayments() : 0;

  // Pages that share a sidebar item are reached through tabs at the top of the page.
  const homeTabs: SectionTab[] = [
    { href: "/app", label: "Overview" },
    ...(can(current.role, "analytics.view") ? [{ href: "/app/reports", label: "Reports" }] : []),
  ];
  const salesTabs: SectionTab[] = sales
    ? [
        { href: "/app/pipeline", label: "Pipeline" },
        { href: "/app/leads", label: "Viewing requests" },
        { href: "/app/agents", label: "AI agents", count: waiting },
      ]
    : [];
  const settingsTabs: SectionTab[] = [
    ...(can(current.role, "team.view") ? [{ href: "/app/team", label: "Team" }] : []),
    ...(can(current.role, "lead.viewAssigned") || can(current.role, "business.update")
      ? [{ href: "/app/integrations", label: "Integrations" }]
      : []),
    ...(can(current.role, "billing.view") ? [{ href: "/app/billing", label: "Billing" }] : []),
    // Home Finder staff only: GCash payments waiting for a check.
    ...(superAdmin ? [{ href: "/admin/payments", label: "Payments to check", count: paymentsWaiting }] : []),
  ];

  const items: NavItem[] = [
    { href: "/app", label: "Dashboard", icon: "dashboard", match: ["/app/reports"] },
    { href: "/app/properties", label: "Properties", icon: "properties" },
    ...(sales ? [{ href: "/app/pipeline", label: "Pipeline", icon: "pipeline" as const, count: waiting, match: ["/app/leads", "/app/agents"] }] : []),
    ...(can(current.role, "conversation.reply") ? [{ href: "/app/inbox", label: "Messages", icon: "inbox" as const }] : []),
    ...(settingsTabs.length
      ? [{ href: settingsTabs[0]!.href, label: "Settings", icon: "settings" as const, count: paymentsWaiting, match: settingsTabs.map((t) => t.href) }]
      : []),
  ];

  return (
    <AppShell current={current} memberships={memberships} fullName={fullName} items={items} switchBusiness={switchBusiness}>
      <SectionTabs groups={[homeTabs, salesTabs, settingsTabs]} />
      {children}
      {(await aiEnabled(current.businessId)) ? <AgentAssistant /> : null}
    </AppShell>
  );
}

async function pendingPayments(): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const { count } = await admin.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}
