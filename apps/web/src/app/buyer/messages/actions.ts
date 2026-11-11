"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { getOrigin, getProfile, requireUser } from "@/lib/auth";
import { replyInApp } from "@/lib/app-chat";
import { getListing } from "@/lib/listings";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MAX_CHAT_CHARS, type ChatMessage } from "@/lib/app-chat-shared";


/** Open (or reuse) the buyer's chat with the business behind a public listing. */
export async function startChat(propertyId: string) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(propertyId)) redirect("/buyer");
  const listing = await getListing(propertyId); // only public listings come back
  const admin = createAdminClient();
  if (!listing || !admin) redirect("/buyer/messages?notice=unavailable");

  const { data: prop } = await admin!.from("properties").select("business_id").eq("id", listing!.id).single();
  if (!prop) redirect("/buyer/messages?notice=unavailable");
  const businessId = prop!.business_id as string;
  const profile = await getProfile();
  const name = (profile?.full_name || user.email?.split("@")[0] || "ProPilot buyer").slice(0, 120);

  const find = () =>
    admin!.from("messenger_conversations").select("id").eq("business_id", businessId).eq("buyer_id", user.id).eq("channel", "app").maybeSingle();
  let { data: conv } = await find();
  if (!conv) {
    const { data: created, error } = await admin!
      .from("messenger_conversations")
      .insert({ business_id: businessId, channel: "app", buyer_id: user.id, display_name: name, property_id: listing!.id })
      .select("id")
      .single();
    conv = created ?? (error ? (await find()).data : null); // a second tab may have created it first
  } else {
    await admin!.from("messenger_conversations").update({ property_id: listing!.id, display_name: name }).eq("id", conv.id);
  }
  if (!conv) redirect("/buyer/messages?notice=unavailable");
  redirect(`/buyer/messages/${conv!.id}`);
}

/** The buyer's messages in one chat (read through the buyer-safe function). */
export async function loadChat(conversationId: string): Promise<ChatMessage[]> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_app_messages", { p_conversation: conversationId });
  return (data ?? []) as ChatMessage[];
}

/** Send a message as the buyer. The AI answers in the background unless the team has taken over. */
export async function sendChat(conversationId: string, text: string): Promise<{ error?: string; messages?: ChatMessage[] }> {
  const user = await requireUser();
  const body = text.trim().slice(0, MAX_CHAT_CHARS);
  if (!body) return { error: "Write a message first." };
  const admin = createAdminClient();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(conversationId)) return { error: "This chat isn't available." };
  const { data: conv } = await admin
    .from("messenger_conversations")
    .select("id, business_id, mode")
    .eq("id", conversationId)
    .eq("buyer_id", user.id)
    .eq("channel", "app")
    .maybeSingle();
  if (!conv) return { error: "This chat isn't available." };

  const supabase = await createClient();
  const [hour, day] = await Promise.all([
    supabase.rpc("consume_rate_limit", { p_bucket: "app_chat_hour", p_limit: 40, p_window_seconds: 3600 }),
    supabase.rpc("consume_rate_limit", { p_bucket: "app_chat_day", p_limit: 200, p_window_seconds: 86400 }),
  ]);
  if (hour.data !== true || day.data !== true) return { error: "You've sent a lot of messages. Please wait a while and try again." };

  const now = new Date().toISOString();
  const { data: msg } = await admin
    .from("messenger_messages")
    .insert({ conversation_id: conv.id, business_id: conv.business_id, sender: "buyer", body })
    .select("id")
    .single();
  await admin
    .from("messenger_conversations")
    .update({ last_inbound_at: now, last_message_at: now, ...(conv.mode === "human" ? { needs_attention: true } : {}) })
    .eq("id", conv.id);

  if (msg && conv.mode === "ai") {
    const origin = await getOrigin();
    after(() => replyInApp(conv.id as string, msg.id as string, origin));
  }
  return { messages: await loadChat(conversationId) };
}
