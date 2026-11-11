"use server";

import { revalidatePath } from "next/cache";
import { can } from "@propilot/shared";
import { requireBusiness, requireUser } from "@/lib/auth";
import { pageWithToken, RECONNECT_MESSAGE } from "@/lib/facebook-pages";
import { str } from "@/lib/form";
import { withinReplyWindow } from "@/lib/messenger-window";
import { GraphError, MAX_MESSENGER_TEXT, metaConfig, sendMessage } from "@/lib/meta";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SendState = { error?: string; sent?: number };

/** The conversation, if the signed-in teammate may reply to it (RLS decides what they can see). */
async function ownConversation(id: string) {
  const biz = await requireBusiness();
  if (!can(biz.role, "conversation.reply") || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("messenger_conversations")
    .select("id, business_id, channel, page_row_id, psid, last_inbound_at, mode")
    .eq("id", id)
    .eq("business_id", biz.businessId)
    .maybeSingle();
  return data ? { biz, conv: data } : null;
}

/** Reply as the Page from ProPilot. Replying takes the conversation over from the AI. */
export async function sendAgentMessage(conversationId: string, _prev: SendState, form: FormData): Promise<SendState> {
  const user = await requireUser();
  const found = await ownConversation(conversationId);
  if (!found) return { error: "You can't reply to this conversation." };
  const { biz, conv } = found;
  const text = str(form, "text").slice(0, MAX_MESSENGER_TEXT);
  if (!text) return { error: "Write a message first." };
  if (conv.channel === "messenger" && !withinReplyWindow(conv.last_inbound_at as string | null)) {
    return { error: "Messenger only allows replies within 24 hours of their last message. Call or text them instead." };
  }
  const admin = createAdminClient();
  if (!admin) return { error: "Replying isn't available right now." };

  try {
    let mid: string | undefined;
    if (conv.channel === "messenger") {
      const cfg = metaConfig();
      const page = await pageWithToken(biz.businessId, conv.page_row_id as string);
      if (!cfg || !page) return { error: "This Page isn't connected anymore. Reconnect it in Integrations." };
      mid = await sendMessage(fetch, cfg, page.pageId, page.token, conv.psid as string, text);
    }
    const now = new Date().toISOString();
    await admin.from("messenger_messages").insert({
      conversation_id: conv.id,
      business_id: biz.businessId,
      sender: "agent",
      sent_by: user.id,
      body: text,
      mid: mid ?? null,
    });
    await admin
      .from("messenger_conversations")
      .update({
        mode: "human",
        taken_over_by: user.id,
        needs_attention: false,
        attention_reason: null,
        last_message_at: now,
        last_read_at: now,
      })
      .eq("id", conv.id);
  } catch (e) {
    if (e instanceof GraphError && e.tokenInvalid) return { error: RECONNECT_MESSAGE };
    console.error("[messenger] agent send failed:", e instanceof Error ? e.message : String(e));
    return { error: "Messenger didn't accept the message. Please try again." };
  }
  revalidatePath("/app/inbox");
  return { sent: Date.now() };
}

/** Take over from the AI, or hand the conversation back to it. */
export async function setConversationMode(conversationId: string, mode: "ai" | "human") {
  const user = await requireUser();
  const found = await ownConversation(conversationId);
  const admin = createAdminClient();
  if (!found || !admin) return;
  await admin
    .from("messenger_conversations")
    .update(
      mode === "human"
        ? { mode, taken_over_by: user.id, needs_attention: false, attention_reason: null }
        : { mode, taken_over_by: null, needs_attention: false, attention_reason: null },
    )
    .eq("id", found.conv.id);
  revalidatePath("/app/inbox");
}

const LEAD_STATUSES = ["new", "contacted", "scheduled", "closed"] as const;

export async function setLeadStatus(conversationId: string, form: FormData) {
  const found = await ownConversation(conversationId);
  const admin = createAdminClient();
  const status = str(form, "status");
  if (!found || !admin || !(LEAD_STATUSES as readonly string[]).includes(status)) return;
  await admin.from("messenger_conversations").update({ lead_status: status }).eq("id", found.conv.id);
  revalidatePath("/app/inbox");
}
