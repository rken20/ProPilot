"use server";

import Anthropic from "@anthropic-ai/sdk";
import { can } from "@propilot/shared";
import { revalidatePath } from "next/cache";
import { getProfile, requireBusiness, requireUser } from "@/lib/auth";
import { FACT_COLUMNS, factsOf } from "@/lib/buyer-finder";
import { draftFollowUp, templateFollowUp } from "@/lib/follow-up";
import { appSay, businessLang } from "@/lib/lang-server";
import { DEFAULT_MODEL } from "@/lib/listing-assistant";
import { formatPeso } from "@/lib/money";
import { STAGE_INFO, daysSince, type Stage } from "@/lib/pipeline";
import { aiEnabled } from "@/lib/plan";
import { TYPE_LABEL } from "@/lib/property-labels";
import { transcript, type HelperTurn } from "@/lib/reply-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

export type DraftResult = { text: string; byAi: boolean } | { error: string };

/** The lead as this person may see it (row-level security decides), or null. */
async function ownLead(id: string) {
  const biz = await requireBusiness();
  if (!can(biz.role, "lead.update") || !UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("prospects")
    .select(
      `id, name, stage, property_id, last_activity_at, next_step, ${FACT_COLUMNS}`,
    )
    .eq("id", id)
    .eq("business_id", biz.businessId)
    .maybeSingle();
  return data
    ? { biz, supabase, lead: data as unknown as Record<string, unknown> }
    : null;
}

/** What the lead said they want, in one line, from the facts on file. */
function factsLine(row: Record<string, unknown>): string | null {
  const f = factsOf(row);
  const parts = [
    f.property_types.length
      ? `type: ${f.property_types.map((t) => TYPE_LABEL[t as keyof typeof TYPE_LABEL] ?? t).join(", ")}`
      : null,
    f.budget_max_minor !== null
      ? `budget up to ${formatPeso(f.budget_max_minor)}`
      : null,
    f.areas.length ? `areas: ${f.areas.join(", ")}` : null,
    f.timeline ? `timeline: ${f.timeline}` : null,
    f.financing ? `paying by: ${f.financing}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

/**
 * A follow-up message to start from. The AI writes it on plans with AI; other
 * plans get a plain template. Nothing is sent: the person copies or edits it.
 */
export async function writeFollowUp(prospectId: string): Promise<DraftResult> {
  const say = await appSay();
  const found = await ownLead(prospectId);
  if (!found)
    return { error: say("Lead not found.", "Hindi makita ang lead.") };
  const { biz, supabase, lead } = found;
  const [lang, profile, listingRes, convRes, aiOn] = await Promise.all([
    businessLang(biz.businessId),
    getProfile(),
    lead.property_id
      ? supabase
          .from("properties")
          .select(
            "name, type, location, status, price_minor, reservation_fee_minor",
          )
          .eq("id", lead.property_id as string)
          .eq("business_id", biz.businessId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("messenger_conversations")
      .select("id")
      .eq("prospect_id", prospectId)
      .eq("business_id", biz.businessId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    aiEnabled(biz.businessId),
  ]);
  const listing = listingRes.data;
  const agentName = (profile?.full_name ?? "").trim().split(/\s+/)[0] ?? "";
  const template = () => ({
    text: templateFollowUp(
      {
        leadName: lead.name as string | null,
        agentName,
        businessName: biz.businessName,
        listingName: (listing?.name as string | undefined) ?? null,
      },
      lang,
    ),
    byAi: false,
  });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!aiOn || !apiKey) return template();
  const { data: allowed } = await supabase.rpc("consume_rate_limit", {
    p_bucket: "reply_helper",
    p_limit: 60,
    p_window_seconds: 3600,
  });
  if (allowed !== true) return template();

  let chat: string | null = null;
  if (convRes.data) {
    const { data: msgs } = await supabase
      .from("messenger_messages")
      .select("sender, body")
      .eq("conversation_id", convRes.data.id)
      .eq("business_id", biz.businessId)
      .order("created_at", { ascending: false })
      .limit(12);
    if (msgs?.length)
      chat = transcript(
        msgs
          .reverse()
          .map((m) => ({
            from: m.sender as HelperTurn["from"],
            text: m.body as string,
          })),
        12,
      );
  }
  try {
    const text = await draftFollowUp(
      new Anthropic({ apiKey }),
      process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      {
        businessName: biz.businessName,
        agentName,
        lang,
        lead: {
          name: lead.name as string | null,
          stage: STAGE_INFO[lead.stage as Stage]?.label ?? String(lead.stage),
          days: daysSince(lead.last_activity_at as string, new Date()),
          nextStep: (lead.next_step as string | null) ?? null,
          facts: factsLine(lead),
        },
        listing: listing
          ? [
              `Name: ${listing.name}`,
              `Type: ${TYPE_LABEL[listing.type as keyof typeof TYPE_LABEL] ?? listing.type}`,
              `Location: ${listing.location}`,
              `Status: ${listing.status}`,
              `Selling price: ${formatPeso(Number(listing.price_minor))}`,
              `Reservation fee: ${listing.reservation_fee_minor === null ? "not stated" : formatPeso(Number(listing.reservation_fee_minor))}`,
            ].join("\n")
          : null,
        chat,
      },
    );
    return text ? { text, byAi: true } : template();
  } catch {
    // The AI couldn't be reached: the plain template still gets the follow-up done.
    return template();
  }
}

/** The person has sent the message themselves. Logged on the lead, which counts as activity, so it leaves the list. */
export async function markFollowedUp(
  prospectId: string,
  text: string,
): Promise<{ ok: true } | { error: string }> {
  const say = await appSay();
  const found = await ownLead(prospectId);
  const user = await requireUser();
  const admin = createAdminClient();
  if (!found || !admin)
    return { error: say("Lead not found.", "Hindi makita ang lead.") };
  const body = text.trim() ? `Followed up: ${text.trim()}` : "Followed up.";
  const { error } = await admin
    .from("prospect_events")
    .insert({
      business_id: found.biz.businessId,
      prospect_id: prospectId,
      kind: "task",
      body: body.slice(0, 1000),
      actor: user.id,
    });
  if (error)
    return {
      error: say(
        "Couldn't save it. Please try again.",
        "Hindi na-save. Paki-try ulit.",
      ),
    };
  await admin
    .from("prospects")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", prospectId)
    .eq("business_id", found.biz.businessId);
  revalidatePath("/app/follow-ups");
  revalidatePath(`/app/pipeline/${prospectId}`);
  return { ok: true };
}
