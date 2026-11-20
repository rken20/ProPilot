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
import { aiEnabled, businessPlan } from "@/lib/plan";
import { buyerFinderUsed } from "@/lib/buyer-finder";
import { loadReportData } from "@/lib/report-data";
import { inRange, leadsReport, messengerReport, parseRange } from "@/lib/reports";

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
  const since = daysAgoIso(30);
  const prospectCount = (build: (q: ReturnType<typeof countProspects>) => ReturnType<typeof countProspects>) =>
    build(countProspects()).then((r) => r.count ?? 0);
  const countProspects = () => supabase.from("prospects").select("id", { count: "exact", head: true }).eq("business_id", biz.businessId);

  // Everything below depends only on the lookups above, so it all runs side by side.
  const [pagesConnected, profiles, covers, summary, aiOn, plan, finderUsed, interested, newLeads, messengerLeads, viewRows] = await Promise.all([
    metaConfig() ? businessPages(biz.businessId).then((pages) => pages.length > 0) : Promise.resolve(false),
    memberIds.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", memberIds).then((r) => r.data ?? [])
      : Promise.resolve([] as Array<{ id: string; full_name: string | null; email: string | null }>),
    getCoverThumbs(properties.map((p) => p.id)),
    can(biz.role, "analytics.view") ? reportSummary(biz.businessId) : Promise.resolve(null),
    aiEnabled(biz.businessId),
    businessPlan(biz.businessId),
    canSeeLeads ? buyerFinderUsed(supabase, biz.businessId) : Promise.resolve(0),
    canSeeLeads ? prospectCount((q) => q.in("stage", ["qualified", "viewing", "offer", "reservation"])) : Promise.resolve(null),
    canSeeLeads ? prospectCount((q) => q.gte("created_at", since)) : Promise.resolve(null),
    canSeeLeads ? prospectCount((q) => q.gte("created_at", since).eq("source", "messenger")) : Promise.resolve(0),
    supabase
      .from("listing_views")
      .select("views")
      .eq("business_id", biz.businessId)
      .gte("day", since.slice(0, 10))
      .then((r) => r.data ?? []),
  ]);
  const publicCount = properties.filter((p) => p.is_public).length;
  const views = viewRows.reduce((n, r) => n + (r.views as number), 0);
  const { data: planRow } = await supabase.from("plans").select("price_minor").eq("code", plan.code).maybeSingle();
  const nameOf = (id: string) => {
    if (id === user?.id) return "You";
    const p = profiles?.find((x) => x.id === id);
    return p?.full_name || p?.email || "A teammate";
  };

  // ---- Setup progress for the assistant --------------------------------------
  const hasFinancing = properties.some((p) => {
    const f = (p.financing ?? {}) as Record<string, unknown>;
    return Boolean(f.bankFinancing || f.pagIbig || f.inHouse || f.downpaymentPercent !== undefined);
  });
  const steps: SetupStep[] = [
    { label: "Add your first property", done: properties.length > 0, href: "/app/properties/new" },
    { label: "Add price and financing details", done: hasFinancing, href: properties[0] ? `/app/properties/${properties[0].id}` : "/app/properties/new" },
    { label: "Add photos to a listing", done: covers.size > 0, href: properties[0] ? `/app/properties/${properties[0].id}` : "/app/properties/new" },
    { label: "Give a listing a public page and share it", done: publicCount > 0, href: properties[0] ? `/app/properties/${properties[0].id}` : "/app/properties/new" },
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
    activity.push({ at: l.created_at, icon: CalendarDays, tone: "bg-orange-50 text-hot", title: `${l.buyer_name} sent an inquiry`, detail: nameOfProp(l.property_id), href: "/app/leads" });
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
      plan={{ code: plan.code, name: plan.name, priceMinor: Number(planRow?.price_minor ?? 0) }}
      properties={properties.map((p) => ({ ...p, price_minor: Number(p.price_minor), coverUrl: mediaUrl(covers.get(p.id)) }))}
      steps={steps}
      finder={canSeeLeads && plan.ai && plan.homeFinderBuyers !== 0 ? { used: finderUsed, limit: plan.homeFinderBuyers } : null}
      interested={interested}
      views={views}
      inquiries={newLeads === null ? null : { total: newLeads, messenger: messengerLeads }}
      summary={summary}
      assistantLive={(publicCount > 0 || pagesConnected) && aiOn}
      recent={recent}
    />
  );
}

/** The last 30 days at a glance, for roles that can see reports. */
async function reportSummary(businessId: string): Promise<ReportSummary> {
  const range = parseRange({ range: "30" });
  const supabase = await createClient();
  const [d, viewRows] = await Promise.all([
    loadReportData(businessId, range),
    supabase.from("listing_views").select("property_id, views").eq("business_id", businessId).gte("day", daysAgoIso(30).slice(0, 10)),
  ]);
  const convs = d.convs.filter((c) => inRange(c.created_at, range));
  const chats = messengerReport(convs, d.msgs);
  const views = new Map<string, number>();
  for (const v of viewRows.data ?? []) views.set(v.property_id as string, (views.get(v.property_id as string) ?? 0) + (v.views as number));
  const inquiries = new Map<string, number>();
  for (const r of d.vr) if (inRange(r.created_at, range)) inquiries.set(r.property_id, (inquiries.get(r.property_id) ?? 0) + 1);
  return {
    leads: leadsReport(d.vr, convs, range),
    topListings: d.props
      .map((p) => ({ id: p.id, name: p.name, views: views.get(p.id) ?? 0, inquiries: inquiries.get(p.id) ?? 0 }))
      .filter((l) => l.views + l.inquiries > 0)
      .sort((a, b) => b.inquiries - a.inquiries || b.views - a.views)
      .slice(0, 3),
    chats: { conversations: chats.conversations, aiOnly: chats.aiOnly, afterHoursAnswered: chats.afterHoursAnswered },
  };
}
