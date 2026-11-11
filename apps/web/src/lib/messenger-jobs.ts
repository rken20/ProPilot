import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sendEmail, esc } from "./email";
import { pageWithToken } from "./facebook-pages";
import { DEFAULT_MODEL } from "./listing-assistant";
import { messengerReply, type MessengerListing, type Turn } from "./messenger-assistant";
import {
  GraphError,
  messengerName,
  metaConfig,
  PAGE_INBOX_APP_ID,
  sendMessage,
  typingOn,
  type MessengerEvent,
} from "./meta";
import { createAdminClient } from "./supabase/admin";

/** Cost guards: AI replies per conversation per day, and per business per day. */
export const AI_REPLIES_PER_CONVERSATION_DAY = 25;
export const AI_REPLIES_PER_BUSINESS_DAY = 400;
/** Wait this long after a message before answering, so a burst of messages gets one reply. */
const SETTLE_MS = 2500;

function log(step: string, e: unknown) {
  console.error(`[messenger] ${step}:`, e instanceof Error ? e.message : String(e));
}

const ATTACHMENT_LABEL: Record<string, string> = { image: "[photo]", video: "[video]", audio: "[voice message]", file: "[file]", sticker: "[sticker]" };

/** Handle one webhook event. Never throws: Meta has already had its 200. */
export async function handleMessengerEvent(ev: MessengerEvent, appOrigin: string): Promise<void> {
  try {
    await handle(ev, appOrigin);
  } catch (e) {
    log("event", e);
  }
}

async function handle(ev: MessengerEvent, appOrigin: string) {
  const admin = createAdminClient();
  const cfg = metaConfig();
  if (!admin || !cfg) return;

  // The Page row with Messenger switched on (a Page could be connected to more than one business).
  const { data: pageRow } = await admin
    .from("facebook_pages")
    .select("id, business_id, name")
    .eq("page_id", ev.pageId)
    .eq("messenger_enabled", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pageRow) return;
  const businessId = pageRow.business_id as string;

  // Our own sends come back as echoes; we stored them when we sent them.
  if (ev.echo && ev.echo.appId === cfg.appId) return;

  const now = new Date(ev.timestamp).toISOString();
  const { data: conv } = await admin
    .from("messenger_conversations")
    .upsert({ business_id: businessId, page_row_id: pageRow.id, page_id: ev.pageId, psid: ev.psid }, { onConflict: "page_id,psid", ignoreDuplicates: false })
    .select("id, mode, display_name, last_inbound_at")
    .single();
  if (!conv) return;

  const body =
    ev.text?.trim() ||
    (ev.attachment ? (ATTACHMENT_LABEL[ev.attachment] ?? "[attachment]") : ev.postback ? `[tapped] ${ev.postback}` : "");
  if (!body) return;

  const sender = ev.echo ? "page" : "buyer";
  const { error: dup } = await admin
    .from("messenger_messages")
    .insert({ conversation_id: conv.id, business_id: businessId, sender, body: body.slice(0, 4000), mid: ev.mid ?? null, created_at: now });
  if (dup) return; // already handled (Meta retries deliveries)

  if (ev.echo) {
    // Someone replied in Facebook's own Page inbox: that's a takeover. Pause the AI.
    await admin
      .from("messenger_conversations")
      .update({ mode: "human", needs_attention: false, last_message_at: now })
      .eq("id", conv.id);
    return;
  }

  await admin
    .from("messenger_conversations")
    .update({ last_inbound_at: now, last_message_at: now, ...(conv.mode === "human" ? { needs_attention: true } : {}) })
    .eq("id", conv.id);

  const page = await pageWithToken(businessId, pageRow.id as string);
  if (!page) return;

  if (!conv.display_name) {
    const name = await messengerName(fetch, cfg, ev.psid, page.token);
    if (name) await admin.from("messenger_conversations").update({ display_name: name }).eq("id", conv.id);
  }

  if (conv.mode !== "ai") return;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await flag(admin, conv.id as string, "The AI assistant isn't switched on, so this needs a person.");
    return;
  }

  // Let a burst of messages settle, then answer only from the newest one's handler.
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  const { data: latest } = await admin
    .from("messenger_messages")
    .select("mid, created_at")
    .eq("conversation_id", conv.id)
    .eq("sender", "buyer")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest && ev.mid && latest.mid !== ev.mid) return;

  // Re-read the mode: someone may have taken over in the meantime.
  const { data: fresh } = await admin.from("messenger_conversations").select("mode").eq("id", conv.id).single();
  if (fresh?.mode !== "ai") return;

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ count: convCount }, { count: bizCount }] = await Promise.all([
    admin.from("messenger_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id).eq("sender", "ai").gte("created_at", since),
    admin.from("messenger_messages").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("sender", "ai").gte("created_at", since),
  ]);
  if ((convCount ?? 0) >= AI_REPLIES_PER_CONVERSATION_DAY || (bizCount ?? 0) >= AI_REPLIES_PER_BUSINESS_DAY) {
    await admin.from("messenger_conversations").update({ mode: "human" }).eq("id", conv.id);
    await flag(admin, conv.id as string, "The AI reached today's reply limit for this conversation, so it's waiting for a person.");
    return;
  }

  const [{ data: history }, { data: props }] = await Promise.all([
    admin.from("messenger_messages").select("sender, body").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(16),
    admin
      .from("properties")
      .select("id, name, type, location, status, price_minor, reservation_fee_minor, description, financing")
      .eq("business_id", businessId)
      .in("status", ["available", "reserved"])
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);
  const turns: Turn[] = (history ?? []).reverse().map((m) => ({ from: m.sender as Turn["from"], text: m.body as string }));

  await typingOn(fetch, cfg, page.pageId, page.token, ev.psid);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const result = await messengerReply(new Anthropic({ apiKey }), process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, {
    pageName: page.name,
    listings: (props ?? []) as MessengerListing[],
    history: turns,
    today,
  });

  // A takeover may have happened while the AI was writing; don't talk over a person.
  const { data: again } = await admin.from("messenger_conversations").select("mode").eq("id", conv.id).single();
  if (again?.mode !== "ai") return;

  try {
    const mid = await sendMessage(fetch, cfg, page.pageId, page.token, ev.psid, result.reply);
    await admin.from("messenger_messages").insert({ conversation_id: conv.id, business_id: businessId, sender: "ai", body: result.reply, mid: mid ?? null });
  } catch (e) {
    log("send", e);
    if (e instanceof GraphError && e.tokenInvalid) {
      await flag(admin, conv.id as string, "ProPilot couldn't reply: reconnect the Page in Integrations.");
    }
    return;
  }

  const updates: Record<string, unknown> = { last_message_at: new Date().toISOString() };
  if (result.viewing) {
    Object.assign(updates, {
      lead_name: result.viewing.name,
      lead_phone: result.viewing.phone,
      lead_date: result.viewing.preferredDate ?? null,
      lead_notes: result.viewing.notes ?? null,
      property_id: result.viewing.listingId ?? null,
      lead_status: "new",
      needs_attention: true,
      attention_reason: "New viewing request from Messenger.",
    });
  }
  if (result.handover) Object.assign(updates, { mode: "human", needs_attention: true, attention_reason: result.handover });
  await admin.from("messenger_conversations").update(updates).eq("id", conv.id);

  if (result.viewing || result.handover) {
    const listing = (props ?? []).find((p) => p.id === result.viewing?.listingId);
    await alertTeam(admin, businessId, {
      subject: result.viewing ? `New viewing request on Messenger${listing ? `: ${listing.name}` : ""}` : `A Messenger chat needs you: ${page.name}`,
      lines: result.viewing
        ? [
            ["Name", result.viewing.name],
            ["Mobile", result.viewing.phone],
            ["Property", listing ? `${listing.name}, ${listing.location}` : "Not said"],
            ["Preferred date", result.viewing.preferredDate ?? "Not given"],
          ]
        : [["Why", result.handover!]],
      url: `${appOrigin}/app/inbox?c=${conv.id}`,
    });
  }
}

async function flag(admin: NonNullable<ReturnType<typeof createAdminClient>>, conversationId: string, reason: string) {
  await admin.from("messenger_conversations").update({ needs_attention: true, attention_reason: reason }).eq("id", conversationId);
}

/** Email the owner, admins and agents, if email is set up. */
async function alertTeam(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  businessId: string,
  mail: { subject: string; lines: Array<[string, string]>; url: string },
) {
  try {
    const { data: members } = await admin
      .from("business_members")
      .select("user_id")
      .eq("business_id", businessId)
      .eq("status", "active")
      .in("role", ["owner", "admin", "agent"]);
    if (!members?.length) return;
    const { data: profiles } = await admin.from("profiles").select("email").in("id", members.map((m) => m.user_id));
    const to = (profiles ?? []).map((p) => p.email as string | null).filter((e): e is string => Boolean(e));
    if (!to.length) return;
    const subject = mail.subject.replace(/[\r\n]+/g, " ").slice(0, 200);
    const text = [...mail.lines.map(([k, v]) => `${k}: ${v}`), "", `Open the conversation: ${mail.url}`].join("\n");
    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1c1a17">
<h1 style="font-size:18px">${esc(subject)}</h1>
<table>${mail.lines.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b665d">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
<p><a href="${esc(mail.url)}" style="display:inline-block;background:#24543f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open the conversation</a></p>
</body></html>`;
    await sendEmail({ to, subject, text, html });
  } catch (e) {
    log("alert", e);
  }
}

export { withinReplyWindow } from "./messenger-window";

export { PAGE_INBOX_APP_ID };
