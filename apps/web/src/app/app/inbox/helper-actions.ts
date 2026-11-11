"use server";

import Anthropic from "@anthropic-ai/sdk";
import { can } from "@propilot/shared";
import { getProfile, requireBusiness } from "@/lib/auth";
import { DEFAULT_MODEL } from "@/lib/listing-assistant";
import type { MessengerListing } from "@/lib/messenger-assistant";
import { draftReply, summarize, translate, type HelperTurn, type Summary } from "@/lib/reply-helper";
import { createClient } from "@/lib/supabase/server";

type Result<T> = { ok: T } | { error: string };

/** Who's asking, plus the chat as they're allowed to see it (row-level security applies). */
async function context(conversationId: string) {
  const biz = await requireBusiness();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!can(biz.role, "conversation.reply")) return { error: "You can't use the reply helper." } as const;
  if (!apiKey) return { error: "The AI isn't switched on yet." } as const;
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return { error: "Conversation not found." } as const;
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("consume_rate_limit", { p_bucket: "reply_helper", p_limit: 60, p_window_seconds: 3600 });
  if (allowed !== true) return { error: "You've used the helper a lot in the last hour. Please try again later." } as const;
  const { data: msgs } = await supabase
    .from("messenger_messages")
    .select("sender, body")
    .eq("conversation_id", conversationId)
    .eq("business_id", biz.businessId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (!msgs?.length) return { error: "There's nothing in this chat yet." } as const;
  const turns: HelperTurn[] = msgs.reverse().map((m) => ({ from: m.sender as HelperTurn["from"], text: m.body as string }));
  return { biz, supabase, turns, client: new Anthropic({ apiKey }), model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL } as const;
}

export async function summarizeConversation(conversationId: string): Promise<Result<Summary>> {
  const c = await context(conversationId);
  if ("error" in c) return { error: c.error! };
  try {
    return { ok: await summarize(c.client, c.model, c.turns) };
  } catch {
    return { error: "Couldn't summarize just now. Please try again." };
  }
}

export async function draftConversationReply(conversationId: string, notes: string): Promise<Result<string>> {
  const c = await context(conversationId);
  if ("error" in c) return { error: c.error! };
  const [{ data: props }, profile] = await Promise.all([
    c.supabase
      .from("properties")
      .select("id, name, type, location, status, price_minor, reservation_fee_minor, description, financing")
      .eq("business_id", c.biz.businessId)
      .in("status", ["available", "reserved"])
      .limit(40),
    getProfile(),
  ]);
  try {
    const text = await draftReply(c.client, c.model, {
      businessName: c.biz.businessName,
      agentName: profile?.full_name || "the agent",
      turns: c.turns,
      listings: (props ?? []) as MessengerListing[],
      notes,
    });
    return text ? { ok: text } : { error: "Couldn't draft a reply. Please try again." };
  } catch {
    return { error: "Couldn't draft a reply just now. Please try again." };
  }
}

export async function translateText(conversationId: string, text: string, to: "en" | "fil"): Promise<Result<string>> {
  if (!text.trim()) return { error: "Write something to translate first." };
  const c = await context(conversationId);
  if ("error" in c) return { error: c.error! };
  try {
    const out = await translate(c.client, c.model, text, to === "en" ? "en" : "fil");
    return out ? { ok: out } : { error: "Couldn't translate. Please try again." };
  } catch {
    return { error: "Couldn't translate just now. Please try again." };
  }
}
