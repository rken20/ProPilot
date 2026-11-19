import { businessPages } from "@/lib/facebook-pages";
import { metaConfig } from "@/lib/meta";
import { Building2, CalendarDays, CircleCheck, UserPlus } from "lucide-react";
import { can } from "@propilot/shared";
import { getUser, requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCoverThumbs } from "@/lib/listings";
import { mediaUrl } from "@/lib/media";
import { daysAgoIso, greeting, longDate } from "@/lib/time";
import { DashboardView, type Activity, type ReportSummary, type SetupStep } from "./dashboard-view";
import { aiEnabled } from "@/lib/plan";
import { loadReportData } from "@/lib/report-data";
import { inRange, leadsReport, listingReport, messengerReport, parseRange } from "@/lib/reports";

const NOTICES: Record<string, string> = {
  welcome: "Your business is set up. Add your first property so the assistant has something to talk about.",
  "password-updated": "Your password has been updated.",
};

export default async function DashboardPage({ searchParams }: PageProps<"/app">) {
  const sp = await searchParams;
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice] : undefined;
  const [biz, user] = await Promise.all([requireBusiness(), getUser()]);
  const supabase = await createClient();
  const canManageTeam = can(biz.role, "team.invite");

  const canSeeLeads = can(biz.role, "lead.viewAll") || can(biz.role, "lead.viewAssigned");
  const [propsRes, membersRes, invitesRes, leadsRes] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, location, price_minor, currency, status, financing, is_public, created_at, updated_at")
      .eq("business_id", biz.businessId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false }),
    supabase
      .from("business_members")
      .select("user_id, role, created_at")
      .eq("business_id", biz.businessId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    canManageTeam
      ? supabase
          .from("invitations")
          .select("id, email, role, created_at, accepted_at")
          .eq("business_id", biz.businessId)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] as Array<{ id: string; email: string; role: string; created_at: string; accepted_at: string | null }> }),
    canSeeLeads
      ? supabase
          .from("viewing_requests")
          .select("id, property_id, buyer_name, status, created_at")
          .eq("business_id", biz.businessId)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as Array<{ id: string; property_id: string; buyer_name: string; status: string; created_at: string }> }),
  ]);
  const leads = leadsRes.data ?? [];
  const properties = propsRes.data ?? [];
  const members = membersRes.data ?? [];
  const invites = invitesRes.data ?? [];
  const memberIds = members.map((m) => m.user_id);
  const canSeeChats = can(biz.role, "conversation.reply");
  const since = daysAgoIso(30);
  const messengerCount = (filter: "recent" | "waiting") => {
    const q = supabase.from("messenger_conversations").select("id", { count: "exact", head: true }).eq("business_id", biz.businessId).eq("channel", "messenger");
    return (filter === "recent" ? q.gte("created_at", since) : q.eq("needs_attention", true)).then((r) => r.count ?? 0);
  };

  // Everything below depends only on the lookups above, so it all runs side by side.
  const [pagesConnected, messenger, profiles, covers, summary, aiOn] = await Promise.all([
    metaConfig() ? businessPages(biz.businessId).then((pages) => pages.length > 0) : Promise.resolve(false),
    // Messenger inquiries: new Messenger chats in the last 30 days, and how many wait for the team.
    canSeeChats
      ? Promise.all([messengerCount("recent"), messengerCount("waiting")]).then(([count, waiting]) => ({ count, waiting }))
      : Promise.resolve(null),
    memberIds.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", memberIds).then((r) => r.data ?? [])
      : Promise.resolve([] as Array<{ id: string; full_name: string | null; email: string | null }>),
    getCoverThumbs(properties.map((p) => p.id)),
    can(biz.role, "analytics.view") ? reportSummary(biz.businessId) : Promise.resolve(null),
    aiEnabled(biz.businessId),
  ]);
  const newLeads = leads.filter((l) => l.status === "new").length;
  const openLeads = leads.filter((l) => ["new", "contacted", "scheduled"].includes(l.status)).length;
  const publicCount = properties.filter((p) => p.is_public).length;
  const nameOf = (id: string) => {
    if (id === user?.id) return "You";
    const p = profiles?.find((x) => x.id === id);
    return p?.full_name || p?.email || "A teammate";
  };

  // ---- Headline numbers: only what we actually know -------------------------
  const available = properties.filter((p) => p.status === "available");
  const reserved = properties.filter((p) => p.status === "reserved").length;
  const inventoryValue = available.reduce((sum, p) => sum + Number(p.price_minor), 0);

  // ---- Setup progress for the assistant --------------------------------------
  const hasFinancing = properties.some((p) => {
    const f = (p.financing ?? {}) as Record<string, unknown>;
    return Boolean(f.bankFinancing || f.pagIbig || f.inHouse || f.downpaymentPercent !== undefined);
  });
  const steps: SetupStep[] = [
    { label: "Add your first property", done: properties.length > 0, href: "/app/properties/new" },
    { label: "Add price and financing details", done: hasFinancing, href: properties[0] ? `/app/properties/${properties[0].id}` : "/app/properties/new" },
    { label: "Add photos to a listing", done: covers.size > 0, href: properties[0] ? `/app/properties/${properties[0].id}` : "/app/properties/new" },
    { label: "Show a listing to Home Finder buyers", done: publicCount > 0, href: properties[0] ? `/app/properties/${properties[0].id}` : "/app/properties/new" },
    { label: "Invite your team", done: members.length > 1 || invites.length > 0, href: canManageTeam ? "/app/team" : undefined },
    metaConfig()
      ? { label: "Connect your Facebook Page", done: pagesConnected, href: "/app/integrations" }
      : { label: "Connect your Facebook Page", done: false, soon: true },
  ];

  // ---- Recent activity, built from real records ------------------------------
  const activity: Activity[] = [];
  for (const p of properties.slice(0, 8)) {
    activity.push({ at: p.created_at, icon: Building2, tone: "bg-brand-50 text-brand-600", title: "Property added", detail: p.name, href: `/app/properties/${p.id}` });
    if (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime() > 60_000) {
      activity.push({ at: p.updated_at, icon: Building2, tone: "bg-slate-100 text-slate-600", title: "Property updated", detail: p.name, href: `/app/properties/${p.id}` });
    }
  }
  for (const m of members) {
    const who = nameOf(m.user_id);
    activity.push({
      at: m.created_at,
      icon: m.role === "owner" ? CircleCheck : UserPlus,
      tone: "bg-brand-50 text-good",
      title: m.role === "owner" ? "Business created" : `${who} joined the team`,
      detail: m.role === "owner" ? biz.businessName : `as ${m.role}`,
    });
  }
  for (const i of invites) {
    activity.push({ at: i.created_at, icon: UserPlus, tone: "bg-amber-50 text-amber-700", title: "Invitation sent", detail: `${i.email}, ${i.role}`, href: "/app/team" });
  }
  const nameOfProp = (id: string) => properties.find((p) => p.id === id)?.name ?? "a listing";
  for (const l of leads.slice(0, 10)) {
    activity.push({ at: l.created_at, icon: CalendarDays, tone: "bg-orange-50 text-hot", title: `${l.buyer_name} requested a viewing`, detail: nameOfProp(l.property_id), href: "/app/leads" });
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));
  const recent = activity.slice(0, 5);

  const firstName = String(user?.user_metadata?.full_name ?? "").split(" ")[0];

  return (
    <DashboardView
      greetingText={greeting()}
      dateText={longDate()}
      firstName={firstName ?? ""}
      businessName={biz.businessName}
      notice={notice}
      canCreateProperty={can(biz.role, "property.create")}
      canManageTeam={canManageTeam}
      properties={properties.map((p) => ({ ...p, price_minor: Number(p.price_minor), coverUrl: mediaUrl(covers.get(p.id)) }))}
      availableCount={available.length}
      reservedCount={reserved}
      inventoryValue={inventoryValue}
      steps={steps}
      leads={canSeeLeads ? { newCount: newLeads, openCount: openLeads } : null}
      publicCount={publicCount}
      messenger={messenger}
      summary={summary}
      pagesConnected={pagesConnected}
      assistantLive={publicCount > 0 && aiOn}
      recent={recent}
    />
  );
}

/** The last 30 days at a glance, for roles that can see reports. */
async function reportSummary(businessId: string): Promise<ReportSummary> {
  const range = parseRange({ range: "30" });
  const d = await loadReportData(businessId, range);
  const convs = d.convs.filter((c) => inRange(c.created_at, range));
  const chats = messengerReport(convs, d.msgs);
  return {
    leads: leadsReport(d.vr, convs, range),
    topListings: listingReport(d.props, d.vr, convs, d.saves, d.questions, d.posts)
      .filter((l) => l.viewingRequests + l.questions + l.saves > 0)
      .slice(0, 3)
      .map((l) => ({ id: l.id, name: l.name, viewingRequests: l.viewingRequests, questions: l.questions, saves: l.saves })),
    chats: { conversations: chats.conversations, aiOnly: chats.aiOnly, afterHoursAnswered: chats.afterHoursAnswered },
  };
}
