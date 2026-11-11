import "server-only";
import { createAdminClient } from "./supabase/admin";
import type { ConversationRow, EventRow, MemberRow, MessageRow, PropertyRow, Range, ViewingRow } from "./reports";

export type ReportData = {
  props: PropertyRow[];
  vr: ViewingRow[];
  convs: ConversationRow[];
  msgs: MessageRow[];
  saves: EventRow[];
  questions: EventRow[];
  posts: EventRow[];
  members: MemberRow[];
};

const EMPTY: ReportData = { props: [], vr: [], convs: [], msgs: [], saves: [], questions: [], posts: [], members: [] };

/**
 * Everything the reports need for one business and one range. Uses the service
 * role (buyer saves aren't readable by agents row by row), so every query is
 * filtered to the business here; callers check the role first.
 */
export async function loadReportData(businessId: string, r: Range): Promise<ReportData> {
  const admin = createAdminClient();
  if (!admin) return EMPTY;
  const from = r.from.toISOString();
  const to = r.to.toISOString();
  const [props, vr, convs, msgs, saves, questions, posts, members] = await Promise.all([
    admin
      .from("properties")
      .select("id, name, location, status, price_minor, created_at, sold_at, assigned_agent_id")
      .eq("business_id", businessId)
      .limit(2000),
    admin
      .from("viewing_requests")
      .select("id, property_id, status, created_at, first_response_at, responded_by, closed_at")
      .eq("business_id", businessId)
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(10000),
    admin
      .from("messenger_conversations")
      .select("id, created_at, mode, taken_over_by, lead_status, property_id")
      .eq("business_id", businessId)
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(10000),
    admin
      .from("messenger_messages")
      .select("conversation_id, sender, sent_by, created_at")
      .eq("business_id", businessId)
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at")
      .limit(30000),
    admin
      .from("favorites")
      .select("property_id, created_at, properties!inner(business_id)")
      .eq("properties.business_id", businessId)
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(20000),
    admin.from("listing_question_events").select("property_id, created_at").eq("business_id", businessId).gte("created_at", from).lt("created_at", to).limit(50000),
    admin
      .from("facebook_posts")
      .select("property_id, created_at")
      .eq("business_id", businessId)
      .eq("status", "published")
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(5000),
    admin.from("business_members").select("user_id, role").eq("business_id", businessId).eq("status", "active"),
  ]);

  const memberRows = (members.data ?? []) as Array<{ user_id: string; role: string }>;
  const { data: profiles } = memberRows.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", memberRows.map((m) => m.user_id))
    : { data: [] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) || (p.email as string | null) || "Teammate"]));

  return {
    props: (props.data ?? []) as PropertyRow[],
    vr: (vr.data ?? []) as ViewingRow[],
    convs: (convs.data ?? []) as ConversationRow[],
    msgs: (msgs.data ?? []) as MessageRow[],
    saves: ((saves.data ?? []) as Array<{ property_id: string; created_at: string }>).map((s) => ({ property_id: s.property_id, created_at: s.created_at })),
    questions: (questions.data ?? []) as EventRow[],
    posts: ((posts.data ?? []) as Array<{ property_id: string | null; created_at: string }>).flatMap((p) =>
      p.property_id ? [{ property_id: p.property_id, created_at: p.created_at }] : [],
    ),
    members: memberRows.map((m) => ({ user_id: m.user_id, role: m.role, name: nameOf.get(m.user_id) ?? "Teammate" })),
  };
}
