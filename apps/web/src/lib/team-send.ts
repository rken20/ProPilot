import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pageWithToken, RECONNECT_MESSAGE } from "@/lib/facebook-pages";
import { withinReplyWindow } from "@/lib/messenger-window";
import { GraphError, MAX_MESSENGER_TEXT, metaConfig, sendMessage } from "@/lib/meta";

export type TeamConversation = {
  id: string;
  channel: string;
  page_row_id: string | null;
  psid: string | null;
  last_inbound_at: string | null;
};

/**
 * Send a message into a chat as the team (Messenger or ProPilot chat) and take
 * the conversation over from the AI. The caller must already have checked that
 * this person may reply in this business; `admin` is the service-role client.
 */
export async function sendAsTeam(
  admin: SupabaseClient,
  businessId: string,
  conv: TeamConversation,
  rawText: string,
  userId: string,
): Promise<{ error?: string }> {
  const text = rawText.trim().slice(0, MAX_MESSENGER_TEXT);
  if (!text) return { error: "Write a message first." };
  if (conv.channel === "messenger" && !withinReplyWindow(conv.last_inbound_at)) {
    return { error: "Messenger only allows replies within 24 hours of their last message. Call or text them instead." };
  }
  try {
    let mid: string | undefined;
    if (conv.channel === "messenger") {
      const cfg = metaConfig();
      const page = conv.page_row_id ? await pageWithToken(businessId, conv.page_row_id) : null;
      if (!cfg || !page || !conv.psid) return { error: "This Page isn't connected anymore. Reconnect it in Integrations." };
      mid = await sendMessage(fetch, cfg, page.pageId, page.token, conv.psid, text);
    }
    const now = new Date().toISOString();
    await admin.from("messenger_messages").insert({
      conversation_id: conv.id,
      business_id: businessId,
      sender: "agent",
      sent_by: userId,
      body: text,
      mid: mid ?? null,
    });
    await admin
      .from("messenger_conversations")
      .update({
        mode: "human",
        taken_over_by: userId,
        needs_attention: false,
        attention_reason: null,
        last_message_at: now,
        last_read_at: now,
      })
      .eq("id", conv.id)
      .eq("business_id", businessId);
    return {};
  } catch (e) {
    if (e instanceof GraphError && e.tokenInvalid) return { error: RECONNECT_MESSAGE };
    console.error("[messenger] team send failed:", e instanceof Error ? e.message : String(e));
    return { error: "Messenger didn't accept the message. Please try again." };
  }
}
