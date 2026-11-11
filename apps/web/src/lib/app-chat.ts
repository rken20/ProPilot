import "server-only";
import { aiTurn, applyTurn } from "./messenger-jobs";
import { createAdminClient } from "./supabase/admin";

/** Let a quick burst of buyer messages settle before answering, like Messenger. */
const SETTLE_MS = 1500;

/** The AI's reply to a buyer's in-app message. Runs after the response; never throws. */
export async function replyInApp(conversationId: string, triggerMessageId: string, appOrigin: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!admin) return;
    const { data: conv } = await admin
      .from("messenger_conversations")
      .select("id, business_id, property_id, mode, businesses(name)")
      .eq("id", conversationId)
      .eq("channel", "app")
      .maybeSingle();
    if (!conv || conv.mode !== "ai") return;
    if (!apiKey) {
      await admin
        .from("messenger_conversations")
        .update({ needs_attention: true, attention_reason: "The AI assistant isn't switched on, so this needs a person." })
        .eq("id", conversationId);
      return;
    }

    await new Promise((r) => setTimeout(r, SETTLE_MS));
    const { data: latest } = await admin
      .from("messenger_messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("sender", "buyer")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest && latest.id !== triggerMessageId) return; // a newer message will be answered instead

    const name = ((conv.businesses as unknown as { name?: string } | null)?.name ?? "the agency").slice(0, 120);
    const turn = await aiTurn(admin, { id: conv.id as string, business_id: conv.business_id as string, property_id: conv.property_id as string | null }, {
      name,
      channel: "app",
      apiKey,
    });
    if (!turn) return;
    await admin.from("messenger_messages").insert({ conversation_id: conv.id, business_id: conv.business_id, sender: "ai", body: turn.result.reply });
    await applyTurn(admin, conv.id as string, conv.business_id as string, turn, { channelLabel: "ProPilot chat", sourceName: name, appOrigin });
  } catch (e) {
    console.error("[app-chat] reply failed:", e instanceof Error ? e.message : String(e));
  }
}
