import { LangProvider } from "@/components/lang";
import { businessLang } from "@/lib/lang-server";
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
import { avatarUrl } from "@/lib/media";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const current = await requireBusiness();
  const [memberships, user] = await Promise.all([getMemberships(), getUser()]);
  const sales = can(current.role, "lead.viewAll") || can(current.role, "lead.viewAssigned");
  // Independent lookups run side by side: each is a round trip to the database.
  const [waiting, superAdmin, aiOn, profile, lang] = await Promise.all([
    // AI suggestions waiting for a decision, shown as a badge on Leads and its "AI agents" tab.
    sales
      ? createClient().then(async (supabase) =>
          (
            await supabase
              .from("agent_tasks")
              .select("id", { count: "exact", head: true })
              .eq("business_id", current.businessId)
              .eq("status", "proposed")
          ).count ?? 0,
        )
      : Promise.resolve(0),
    user ? isSuperAdmin(user.id) : Promise.resolve(false),
    aiEnabled(current.businessId),
    // The name and photo the person set on their Account page.
    user
      ? createClient().then(async (supabase) => (await supabase.from("profiles").select("full_name, avatar_path").eq("id", user.id).maybeSingle()).data)
      : Promise.resolve(null),
    // Taglish or English, the same for the whole business.
    businessLang(current.businessId),
  ]);
  const fullName = profile?.full_name || String(user?.user_metadata?.full_name ?? "") || (user?.email ?? "");
  const paymentsWaiting = superAdmin ? await pendingPayments() : 0;

  // Pages that share a sidebar item are reached through tabs at the top of the page.
  const homeTabs: SectionTab[] = [
    { href: "/app", label: "Overview" },
    ...(can(current.role, "analytics.view") ? [{ href: "/app/reports", label: "Reports" }] : []),
  ];
  const salesTabs: SectionTab[] = sales
    ? [
        { href: "/app/pipeline", label: "Leads" },
        { href: "/app/leads", label: "Inquiries" },
        { href: "/app/agents", label: "AI agents", count: waiting },
      ]
    : [];
  const settingsTabs: SectionTab[] = [
    ...(can(current.role, "team.view") ? [{ href: "/app/team", label: "Team" }] : []),
    ...(can(current.role, "lead.viewAssigned") || can(current.role, "business.update")
      ? [{ href: "/app/integrations", label: "Integrations" }]
      : []),
    ...(can(current.role, "billing.view") ? [{ href: "/app/billing", label: "Billing" }] : []),
    // MyHomeSeller staff only: GCash payments waiting for a check.
    ...(superAdmin
      ? [
          { href: "/admin/payments", label: "Payments to check", count: paymentsWaiting },
          { href: "/admin/accounts", label: "Accounts" },
        ]
      : []),
  ];

  const items: NavItem[] = [
    { href: "/app", label: "Dashboard", icon: "dashboard", match: ["/app/reports"] },
    { href: "/app/properties", label: "Properties", icon: "properties", match: ["/app/pricing", "/app/video"] },
    ...(sales ? [{ href: "/app/pipeline", label: "Leads", icon: "pipeline" as const, count: waiting, match: ["/app/leads", "/app/agents"] }] : []),
    ...(can(current.role, "conversation.reply") ? [{ href: "/app/inbox", label: "Messages", icon: "inbox" as const }] : []),
    ...(settingsTabs.length
      ? [{ href: settingsTabs[0]!.href, label: "Settings", icon: "settings" as const, count: paymentsWaiting, match: settingsTabs.map((t) => t.href) }]
      : []),
  ];

  return (
    <LangProvider lang={lang}>
    <AppShell current={current} memberships={memberships} fullName={fullName} avatarUrl={avatarUrl(profile?.avatar_path)} items={items} switchBusiness={switchBusiness}>
      <SectionTabs groups={[homeTabs, salesTabs, settingsTabs]} />
      {children}
      {aiOn ? <AgentAssistant /> : null}
    </AppShell>
    </LangProvider>
  );
}

async function pendingPayments(): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const { count } = await admin.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}
