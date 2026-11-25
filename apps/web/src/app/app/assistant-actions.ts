"use server";

import { appLang, appSay } from "@/lib/lang-server";
import Anthropic from "@anthropic-ai/sdk";
import { can } from "@propilot/shared";
import { getProfile, requireBusiness } from "@/lib/auth";
import { agentAnswer, sanitizeAgentHistory, type AgentTools, type AgentTurn } from "@/lib/agent-assistant";
import { DEFAULT_MODEL } from "@/lib/listing-assistant";
import { formatPeso } from "@/lib/money";
import { loadReportData } from "@/lib/report-data";
import { fmtDuration, leadsReport, messengerReport, parseRange } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { aiEnabled } from "@/lib/plan";
import { upgradeMessage } from "@/lib/plan-rules";

const ROLE = { owner: "owner", admin: "admin", agent: "agent", marketing: "marketing" } as const;

/** One turn of "Ask MyHomeSeller". Reads use the person's own access; nothing is changed. */
export async function askAgentAssistant(raw: AgentTurn[]): Promise<{ reply?: string; error?: string }> {
  const say = await appSay();
  const biz = await requireBusiness();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: say("The AI isn't switched on yet.", "Hindi pa naka-on ang AI.") };
  if (!(await aiEnabled(biz.businessId))) return { error: upgradeMessage(say) };
  const history = sanitizeAgentHistory(raw);
  if (!history.length || history.at(-1)!.role !== "user") return { error: say("Ask a question first.", "Magtanong muna.") };

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_bucket: "agent_assistant", p_limit: 40, p_window_seconds: 3600 });
  if (allowed !== true) return { error: say("You've asked a lot in the last hour. Please try again later.", "Marami ka nang naitanong nitong huling oras. Paki-try ulit mamaya.") };

  const since = (days?: number) => new Date(Date.now() - (days ?? 3650) * 86_400_000).toISOString();
  const canSeeLeads = can(biz.role, "lead.viewAll") || can(biz.role, "lead.viewAssigned");
  const canChat = can(biz.role, "conversation.reply");

  const tools: AgentTools = {
    async findLeads({ status, sinceDays, notContacted }) {
      if (!canSeeLeads) return { error: "This role can't see leads." };
      let q = supabase
        .from("viewing_requests")
        .select("buyer_name, buyer_phone, status, preferred_date, created_at, property_id")
        .eq("business_id", biz.businessId)
        .gte("created_at", since(sinceDays))
        .order("created_at", { ascending: false })
        .limit(40);
      if (status) q = q.eq("status", status);
      if (notContacted) q = q.eq("status", "new");
      let c = supabase
        .from("messenger_conversations")
        .select("display_name, lead_name, lead_phone, lead_status, lead_date, channel, created_at, property_id")
        .eq("business_id", biz.businessId)
        .neq("lead_status", "none")
        .gte("created_at", since(sinceDays))
        .order("created_at", { ascending: false })
        .limit(40);
      if (status) c = c.eq("lead_status", status);
      if (notContacted) c = c.eq("lead_status", "new");
      const [{ data: vr }, chats, { data: props }] = await Promise.all([
        q,
        canChat ? c : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
        supabase.from("properties").select("id, name").eq("business_id", biz.businessId),
      ]);
      const name = new Map((props ?? []).map((p) => [p.id, p.name]));
      return [
        ...(vr ?? []).map((l) => ({
          source: "MyHomeSeller viewing request",
          buyer: l.buyer_name,
          phone: l.buyer_phone,
          status: l.status,
          preferred_date: l.preferred_date,
          received: l.created_at,
          listing: name.get(l.property_id) ?? null,
        })),
        ...((chats.data ?? []) as Array<Record<string, unknown>>).map((l) => ({
          source: l.channel === "app" ? "MyHomeSeller chat" : "Messenger",
          buyer: l.lead_name ?? l.display_name,
          phone: l.lead_phone,
          status: l.lead_status,
          preferred_date: l.lead_date,
          received: l.created_at,
          listing: name.get(l.property_id as string) ?? null,
        })),
      ];
    },
    async listListings({ status }) {
      let q = supabase
        .from("properties")
        .select("id, name, location, type, status, price_minor, is_public, updated_at")
        .eq("business_id", biz.businessId)
        .order("updated_at", { ascending: false })
        .limit(60);
      if (status) q = q.eq("status", status);
      const { data } = await q;
      return (data ?? []).map((p) => ({ id: p.id, name: p.name, location: p.location, type: p.type, status: p.status, price: formatPeso(p.price_minor), shown_to_buyers: p.is_public }));
    },
    async listingDetails({ listingId }) {
      if (!/^[0-9a-f-]{36}$/i.test(listingId)) return { error: "No listing with that id." };
      const { data } = await supabase
        .from("properties")
        .select("name, location, type, status, price_minor, reservation_fee_minor, description, financing")
        .eq("business_id", biz.businessId)
        .eq("id", listingId)
        .maybeSingle();
      if (!data) return { error: "No listing with that id." };
      return { ...data, price: formatPeso(data.price_minor), reservation_fee: data.reservation_fee_minor ? formatPeso(data.reservation_fee_minor) : null };
    },
    async chatsNeedingReply() {
      if (!canChat) return { error: "This role can't see chats." };
      const { data } = await supabase
        .from("messenger_conversations")
        .select("id, display_name, lead_name, channel, attention_reason, last_message_at, mode")
        .eq("business_id", biz.businessId)
        .or("needs_attention.eq.true,mode.eq.human")
        .order("last_message_at", { ascending: false })
        .limit(25);
      return (data ?? []).map((c) => ({
        who: c.lead_name ?? c.display_name ?? "Unknown",
        where: c.channel === "app" ? "MyHomeSeller chat" : "Messenger",
        why: c.attention_reason,
        last_message: c.last_message_at,
        open_in_propilot: `/app/inbox?c=${c.id}`,
      }));
    },
    async reportSummary({ days }) {
      if (!can(biz.role, "analytics.view")) return { error: "This role can't see reports." };
      const range = parseRange({ from: undefined, to: undefined, range: undefined });
      const r = { ...range, from: new Date(range.to.getTime() - days * 86_400_000), days, label: `Last ${days} days` };
      const d = await loadReportData(biz.businessId, r);
      const leads = leadsReport(d.vr, d.convs, r);
      const chat = messengerReport(d.convs, d.msgs);
      return {
        period: r.label,
        inquiries: leads.inquiries,
        from_propilot: leads.fromProPilot,
        from_messenger: leads.fromMessenger,
        viewing_requests: leads.viewingRequests,
        reached_viewing_percent: leads.conversion,
        closed: leads.closed,
        median_first_response: fmtDuration(leads.medianFirstResponseMs),
        ai_chats: chat.conversations,
        handled_by_ai_alone: chat.aiOnly,
        handed_to_team: chat.handedOver,
        after_hours_answers: chat.afterHoursAnswered,
      };
    },
  };

  const profile = await getProfile();
  try {
    const reply = await agentAnswer(
      new Anthropic({ apiKey }),
      process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      {
        name: profile?.full_name || "a teammate",
        role: ROLE[biz.role as keyof typeof ROLE] ?? "member",
        businessName: biz.businessName,
        today: new Date().toLocaleDateString("en-PH", { dateStyle: "full", timeZone: "Asia/Manila" }),
        language: await appLang(),
      },
      tools,
      history,
    );
    return { reply };
  } catch (e) {
    console.error("[assistant] failed:", e instanceof Error ? e.message : String(e));
    return { error: say("Couldn't answer just now. Please try again.", "Hindi makasagot ngayon. Paki-try ulit.") };
  }
}
