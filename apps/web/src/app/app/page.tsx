import { businessPages } from "@/lib/facebook-pages";
import { metaConfig } from "@/lib/meta";
import { Building2, CalendarDays, CircleCheck, UserPlus } from "lucide-react";
import { can } from "@propilot/shared";
import { getUser, requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCoverThumbs } from "@/lib/listings";
import { avatarUrl, mediaUrl } from "@/lib/media";
import { daysAgoIso, greeting, longDate } from "@/lib/time";
import { DashboardView, type Activity, type AiItem, type SetupStep } from "./dashboard-view";
import { agentName } from "@/lib/agent-info";
import { aiEnabled, businessPlan } from "@/lib/plan";
import { businessUsage } from "@/lib/usage";
import { buyerFinderUsed } from "@/lib/buyer-finder";
import { performanceSeries, viewingsByMonth } from "@/lib/dashboard-stats";
import { loadReportData } from "@/lib/report-data";
import { inRange, leadsReport, manilaDayStart, parseRange } from "@/lib/reports";

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
  const range = parseRange({ range: "30" });
  const manilaDay = (d: Date) => new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  const lastMonth = parseRange({ range: "last-month" });
  const viewingsFrom = new Date(Math.min(lastMonth.from.getTime(), range.from.getTime())).toISOString();
  const prospectCount = (build: (q: ReturnType<typeof countProspects>) => ReturnType<typeof countProspects>) =>
    build(countProspects()).then((r) => r.count ?? 0);
  const countProspects = () => supabase.from("prospects").select("id", { count: "exact", head: true }).eq("business_id", biz.businessId);
  const none = <T,>(data: T[] = []) => Promise.resolve({ data, count: 0 });

  // Everything below depends only on the lookups above, so it all runs side by side.
  const [pagesConnected, profiles, covers, summary, aiOn, plan, finderUsed, potentialBuyers, newLeads, viewRows, unanswered, viewingRows, aiReplies, lastMatch, waiting, runs] =
    await Promise.all([
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
      supabase
        .from("listing_views")
        .select("property_id, day, views")
        .eq("business_id", biz.businessId)
        .gte("day", manilaDay(range.from))
        .then((r) => (r.data ?? []) as Array<{ property_id: string; day: string; views: number }>),
      // The bell: inquiries nobody has answered yet.
      canSeeLeads
        ? supabase.from("viewing_requests").select("id", { count: "exact", head: true }).eq("business_id", biz.businessId).eq("status", "new")
        : none(),
      canSeeLeads
        ? supabase
            .from("viewing_requests")
            .select("scheduled_at")
            .eq("business_id", biz.businessId)
            .in("status", ["scheduled", "completed"])
            .gte("scheduled_at", viewingsFrom)
            .limit(2000)
        : none<{ scheduled_at: string | null }>(),
      // What the AI has been doing.
      canSeeLeads
        ? supabase
            .from("messenger_messages")
            .select("created_at", { count: "exact" })
            .eq("business_id", biz.businessId)
            .eq("sender", "ai")
            .gte("created_at", manilaDayStart(new Date()).toISOString())
            .order("created_at", { ascending: false })
            .limit(1)
        : none<{ created_at: string }>(),
      canSeeLeads
        ? supabase.from("listing_matches").select("created_at").eq("business_id", biz.businessId).order("created_at", { ascending: false }).limit(1)
        : none<{ created_at: string }>(),
      canSeeLeads
        ? supabase.from("agent_tasks").select("id", { count: "exact", head: true }).eq("business_id", biz.businessId).eq("status", "proposed")
        : none(),
      canSeeLeads
        ? supabase
            .from("agent_runs")
            .select("agent, summary, started_at")
            .eq("business_id", biz.businessId)
            .eq("status", "ok")
            .order("started_at", { ascending: false })
            .limit(6)
        : none<{ agent: string; summary: string | null; started_at: string }>(),
    ]);
  const publicCount = properties.filter((p) => p.is_public).length;
  const viewingTimes = (viewingRows.data ?? []).flatMap((v) => (v.scheduled_at ? [v.scheduled_at] : []));

  // ---- What the AI has been doing, from real records ---------------------------
  const aiActivity: AiItem[] = [];
  const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
  if (waiting.count) {
    aiActivity.push({ kind: "tasks", title: `${plural(waiting.count, "suggestion")} waiting for you`, detail: "Approve or dismiss what the AI drafted", href: "/app/agents" });
  }
  if (aiReplies.count) {
    aiActivity.push({ kind: "chat", title: `Answered ${plural(aiReplies.count, "buyer message")} today`, detail: "On Messenger", at: aiReplies.data?.[0]?.created_at, href: "/app/inbox" });
  }
  if (finderUsed && lastMatch.data?.[0]) {
    aiActivity.push({ kind: "buyers", title: `Found ${plural(finderUsed, "potential buyer")}`, detail: "Buyer Finder, this month", at: lastMatch.data[0].created_at, href: "/app/pipeline" });
  }
  const seenAgents = new Set<string>();
  for (const r of runs.data ?? []) {
    // The latest run of each agent that had something to report.
    if (!r.summary || seenAgents.has(r.agent)) continue;
    seenAgents.add(r.agent);
    aiActivity.push({ kind: "run", title: agentName(r.agent), detail: r.summary, at: r.started_at, href: "/app/agents" });
  }
  aiActivity.sort((a, b) => (a.at ? 1 : 0) - (b.at ? 1 : 0) || (b.at ?? "").localeCompare(a.at ?? ""));

  // ---- Property performance: running totals, and the listing with the most interest ---
  const viewsBy = new Map<string, number>();
  for (const v of viewRows) viewsBy.set(v.property_id, (viewsBy.get(v.property_id) ?? 0) + v.views);
  const topListing = summary
    ? properties
        .map((p) => ({ id: p.id, views: viewsBy.get(p.id) ?? 0, inquiries: summary.inquiriesBy.get(p.id) ?? 0 }))
        .filter((l) => l.views + l.inquiries > 0)
        .sort((a, b) => b.inquiries - a.inquiries || b.views - a.views)[0]
    : undefined;
  // AI allowances this month, for the notice when one is low or used up.
  const usage = canSeeLeads ? await businessUsage(supabase, biz.businessId, plan) : [];
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

  // The name and photo from the Account page, for the corner of the greeting.
  const { data: profile } = user ? await supabase.from("profiles").select("full_name, avatar_path").eq("id", user.id).maybeSingle() : { data: null };
  const fullName = profile?.full_name || String(user?.user_metadata?.full_name ?? "");
  const firstName = fullName.split(" ")[0];

  return (
    <DashboardView
      greetingText={greeting()}
      dateText={longDate()}
      firstName={firstName ?? ""}
      fullName={fullName}
      avatarUrl={avatarUrl(profile?.avatar_path)}
      businessName={biz.businessName}
      notice={notice}
      canCreateProperty={can(biz.role, "property.create")}
      canManageTeam={canManageTeam}
      plan={{ code: plan.code, name: plan.name, priceMinor: Number(planRow?.price_minor ?? 0) }}
      properties={properties.map((p) => ({ ...p, price_minor: Number(p.price_minor), coverUrl: mediaUrl(covers.get(p.id)) }))}
      steps={steps}
      unanswered={canSeeLeads ? (unanswered.count ?? 0) : null}
      inquiries={summary ? { total: summary.leads.inquiries, previous: summary.previousInquiries } : newLeads === null ? null : { total: newLeads, previous: null }}
      viewings={canSeeLeads ? viewingsByMonth(viewingTimes) : null}
      potentialBuyers={potentialBuyers}
      assistant={!aiOn ? "off" : pagesConnected ? "always" : publicCount > 0 ? "on" : "almost"}
      aiActivity={aiActivity.slice(0, 4)}
      performance={
        summary
          ? {
              points: performanceSeries(
                range,
                viewRows,
                summary.leads.series.map((d) => d.propilot + d.messenger),
                viewingTimes,
              ),
              top: topListing ?? null,
            }
          : null
      }
      facebookConnected={pagesConnected}
      pricingAdvisor={plan.priceChecks !== 0}
      videoAds={plan.videoAds !== 0}
      usage={usage}
      canSeeBilling={can(biz.role, "billing.view")}
      recent={recent}
    />
  );
}

/** Inquiries in the last 30 days and the 30 before, for roles that can see reports. */
async function reportSummary(businessId: string) {
  const range = parseRange({ range: "30" });
  const before = { from: new Date(range.from.getTime() - 30 * 86_400_000), to: range.from };
  const d = await loadReportData(businessId, { ...range, from: before.from });
  const vr = d.vr.filter((r) => inRange(r.created_at, range));
  const convs = d.convs.filter((c) => inRange(c.created_at, range));
  const inquiriesBy = new Map<string, number>();
  for (const r of vr) inquiriesBy.set(r.property_id, (inquiriesBy.get(r.property_id) ?? 0) + 1);
  return {
    leads: leadsReport(vr, convs, range),
    previousInquiries: d.vr.filter((r) => inRange(r.created_at, before)).length + d.convs.filter((c) => inRange(c.created_at, before)).length,
    inquiriesBy,
  };
}
