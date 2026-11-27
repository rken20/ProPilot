import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sendEmail, esc } from "./email";
import { pageWithToken } from "./facebook-pages";
import { DEFAULT_MODEL } from "./listing-assistant";
import {
  MAX_HISTORY,
  messengerReply,
  type Channel,
  type MessengerListing,
  type Turn,
} from "./messenger-assistant";
import { OFFERS_PER_LISTING_PER_DAY, dealHoldReply } from "./negotiation";
import type { NegotiationContext, PriorOffer } from "./negotiation";
import { formatPeso } from "./money";
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
import { aiEnabled, businessPlan } from "@/lib/plan";
import { aiRepliesThisMonth } from "@/lib/plan-limits";
import { creditBalance, recordAiUse } from "@/lib/ai-credits";
import { CREDIT_COST, creditsNeeded } from "@/lib/credit-rules";

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
  if (!(await aiEnabled(businessId))) {
    await flag(admin, conv.id as string, "AI replies are part of the paid plans, so this needs a person.");
    return;
  }
  const plan = await businessPlan(businessId);
  // Past the month's AI replies, each reply takes an AI credit (taken once it's sent).
  const credits =
    plan.aiReplies === null
      ? 0
      : creditsNeeded(
          "reply",
          await aiRepliesThisMonth(admin, businessId),
          plan.aiReplies,
        );
  if (credits > 0 && (await creditBalance(admin, businessId)) < credits) {
    await flag(
      admin,
      conv.id as string,
      `This month's ${plan.aiReplies!.toLocaleString()} AI replies on ${plan.name} are used up and there are no AI credits left, so this needs a person. An owner can buy AI credits in Billing.`,
    );
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

  await typingOn(fetch, cfg, page.pageId, page.token, ev.psid);
  const turn = await aiTurn(admin, { id: conv.id as string, business_id: businessId, property_id: null }, { name: page.name, channel: "messenger", apiKey, negotiate: plan.negotiation });
  if (!turn) return;
  // A deal is put on record before the buyer is told about it.
  await commitDeals(admin, conv.id as string, turn);

  try {
    const mid = await sendMessage(
      fetch,
      cfg,
      page.pageId,
      page.token,
      ev.psid,
      turn.result.reply,
    );
    await admin
      .from("messenger_messages")
      .insert({
        conversation_id: conv.id,
        business_id: businessId,
        sender: "ai",
        body: turn.result.reply,
        mid: mid ?? null,
      });
    if (credits > 0)
      await recordAiUse(admin, businessId, "reply", CREDIT_COST.reply);
  } catch (e) {
    log("send", e);
    if (e instanceof GraphError && e.tokenInvalid) {
      await flag(admin, conv.id as string, "MyHomeSeller couldn't reply: reconnect the Page in Integrations.");
    }
    return;
  }
  await applyTurn(admin, conv.id as string, businessId, turn, { channelLabel: "Messenger", sourceName: page.name, appOrigin });
}

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
type ConvRef = { id: string; business_id: string; property_id: string | null };
export type Turn2 = {
  result: Awaited<ReturnType<typeof messengerReply>>;
  props: MessengerListing[];
  language: "taglish" | "english";
  /** Set by commitDeals: the deal recorded this turn, or why one couldn't be. */
  deal?: { agreed?: { amount: string; listing: MessengerListing; ref: string }; clash?: string };
};

/**
 * Record a deal the AI agreed this turn, before the reply goes out. The database
 * checks it again (the pre-approved price, one deal per listing). If it refuses,
 * the buyer gets a neutral reply instead of a deal confirmation, and a person takes over.
 */
export async function commitDeals(admin: Admin, conversationId: string, turn: Turn2) {
  const o = turn.result.offers?.find((x) => x.outcome === "accepted");
  if (!o) return;
  const listing = turn.props.find((p) => p.id === o.listingId);
  const { data: offerId, error } = await admin.rpc("record_offer", {
    p_property: o.listingId,
    p_conversation: conversationId,
    p_amount: o.amountMinor,
    p_counter: null,
    p_outcome: "accepted",
    p_name: o.name ?? null,
    p_ref: o.ref ?? null,
  });
  if (error) log("deal", error.message);
  if (offerId && listing && o.ref) {
    turn.deal = { agreed: { amount: formatPeso(o.amountMinor), listing, ref: o.ref } };
    return;
  }
  const why = error?.message.includes("deal_taken") ? "another buyer's deal on this listing came first" : "it couldn't be recorded";
  const clash = `The buyer's offer of ${formatPeso(o.amountMinor)} for ${listing?.name ?? "a listing"} reached the pre-approved price, but ${why}. The buyer was told an agent will confirm. Please talk to them.`;
  turn.deal = { clash };
  turn.result.reply = dealHoldReply(turn.language);
  turn.result.handover = clash.slice(0, 300);
}

/**
 * One AI turn for a conversation in AI mode: checks the daily caps, reads the
 * history and listings, writes the reply. Returns null when it shouldn't reply
 * (someone took over, or a cap was reached). Sending is the caller's job.
 */
export async function aiTurn(admin: Admin, conv: ConvRef, opts: { name: string; channel: Channel; apiKey: string; negotiate?: boolean }): Promise<Turn2 | null> {
  // Re-read the mode: someone may have taken over in the meantime.
  const { data: fresh } = await admin.from("messenger_conversations").select("mode").eq("id", conv.id).single();
  if (fresh?.mode !== "ai") return null;

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ count: convCount }, { count: bizCount }] = await Promise.all([
    admin.from("messenger_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id).eq("sender", "ai").gte("created_at", since),
    admin.from("messenger_messages").select("id", { count: "exact", head: true }).eq("business_id", conv.business_id).eq("sender", "ai").gte("created_at", since),
  ]);
  if ((convCount ?? 0) >= AI_REPLIES_PER_CONVERSATION_DAY || (bizCount ?? 0) >= AI_REPLIES_PER_BUSINESS_DAY) {
    await admin.from("messenger_conversations").update({ mode: "human" }).eq("id", conv.id);
    await flag(admin, conv.id, "The AI reached today's reply limit for this conversation, so it's waiting for a person.");
    return null;
  }

  const [{ data: history }, { data: props }, { data: settings }] =
    await Promise.all([
      admin
        .from("messenger_messages")
        .select("sender, body")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(MAX_HISTORY),
      admin
        .from("properties")
        .select(
          "id, name, type, location, status, price_minor, reservation_fee_minor, description, financing",
        )
        .eq("business_id", conv.business_id)
        .in("status", ["available", "reserved"])
        .order("updated_at", { ascending: false })
        .limit(40),
      admin
        .from("agent_settings")
        .select("chat_language")
        .eq("business_id", conv.business_id)
        .maybeSingle(),
    ]);
  // Negotiation (Pro, Agency): the owner's lowest prices stay on the server. The model only gets the result of each check.
  let negotiation: NegotiationContext | undefined;
  if (opts.negotiate) {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [{ data: floors }, { data: offers }, { data: deals }, { data: today }] = await Promise.all([
      admin.from("listing_floors").select("property_id, min_price_minor, accept_price_minor").eq("business_id", conv.business_id),
      admin.from("listing_offers").select("property_id, outcome, amount_minor, counter_minor").eq("conversation_id", conv.id).eq("business_id", conv.business_id),
      // Listings with a deal already agreed, in any chat: no second deal on them.
      admin.from("listing_offers").select("property_id, conversation_id").eq("business_id", conv.business_id).in("outcome", ["accepted", "confirmed"]),
      admin.from("listing_offers").select("property_id").eq("business_id", conv.business_id).gte("created_at", since).limit(2000),
    ]);
    const perListing = new Map<string, number>();
    for (const r of today ?? []) perListing.set(r.property_id as string, (perListing.get(r.property_id as string) ?? 0) + 1);
    negotiation = {
      floors: Object.fromEntries(
        (floors ?? []).map((f) => [f.property_id as string, { min: Number(f.min_price_minor), accept: f.accept_price_minor === null ? null : Number(f.accept_price_minor) }]),
      ),
      prior: (offers ?? []).map((o) => ({
        listingId: o.property_id as string,
        outcome: o.outcome as PriorOffer["outcome"],
        amountMinor: Number(o.amount_minor),
        counterMinor: o.counter_minor === null ? null : Number(o.counter_minor),
      })),
      taken: (deals ?? []).filter((d) => d.conversation_id !== conv.id).map((d) => d.property_id as string),
      busy: [...perListing].filter(([, n]) => n >= OFFERS_PER_LISTING_PER_DAY).map(([id]) => id),
    };
  }
  const turns: Turn[] = (history ?? []).reverse().map((m) => ({ from: m.sender as Turn["from"], text: m.body as string }));
  const listings = (props ?? []) as MessengerListing[];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const result = await messengerReply(new Anthropic({ apiKey: opts.apiKey }), process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, {
    pageName: opts.name,
    listings,
    history: turns,
    today,
    channel: opts.channel,
    focusListingId: conv.property_id,
    language: settings?.chat_language === "english" ? "english" : "taglish",
    negotiation,
  });

  // A takeover may have happened while the AI was writing; don't talk over a person.
  const { data: again } = await admin.from("messenger_conversations").select("mode").eq("id", conv.id).single();
  if (again?.mode !== "ai") return null;
  return { result, props: listings, language: settings?.chat_language === "english" ? "english" : "taglish" };
}

/** After the reply is delivered: record a viewing request or handover, and email the team about it. */
export async function applyTurn(
  admin: Admin,
  conversationId: string,
  businessId: string,
  turn: Turn2,
  opts: { channelLabel: string; sourceName: string; appOrigin: string },
) {
  const { result, props } = turn;
  const updates: Record<string, unknown> = { last_message_at: new Date().toISOString() };
  if (result.viewing) {
    Object.assign(updates, {
      lead_name: result.viewing.name,
      lead_phone: result.viewing.phone,
      lead_date: result.viewing.preferredDate ?? null,
      lead_notes: result.viewing.notes ?? null,
      ...(result.viewing.listingId ? { property_id: result.viewing.listingId } : {}),
      lead_status: "new",
      needs_attention: true,
      attention_reason: `New viewing request from ${opts.channelLabel}.`,
    });
  }
  if (result.handover) Object.assign(updates, { mode: "human", needs_attention: true, attention_reason: result.handover });

  // Put this turn's offers on record. One the owner could accept waits for their answer; one at the pre-approved price is a deal.
  let pending: { amount: string; listing: MessengerListing } | null = null;
  const agreed = turn.deal?.agreed ?? null;
  const clash = turn.deal?.clash ?? null;
  for (const o of result.offers ?? []) {
    if (o.outcome === "accepted") continue; // recorded by commitDeals before the reply went out
    const { data: offerId, error } = await admin.rpc("record_offer", {
      p_property: o.listingId,
      p_conversation: conversationId,
      p_amount: o.amountMinor,
      p_counter: o.counterMinor,
      p_outcome: o.outcome,
      p_name: o.name ?? null,
    });
    if (error) log("offer", error.message);
    const listing = props.find((p) => p.id === o.listingId);
    if (o.outcome === "pending" && offerId && listing) pending = { amount: formatPeso(o.amountMinor), listing };
  }
  if (clash) Object.assign(updates, { mode: "human", needs_attention: true, attention_reason: clash.slice(0, 300) });
  else if (agreed) {
    Object.assign(updates, {
      property_id: agreed.listing.id,
      needs_attention: true,
      attention_reason: `Deal agreed by the AI: ${agreed.amount} for ${agreed.listing.name} (ref. ${agreed.ref}), at or above your pre-approved price. Send the reservation agreement and payment instructions.`,
    });
  }
  if (pending && !agreed && !clash) {
    Object.assign(updates, {
      property_id: pending.listing.id,
      needs_attention: true,
      attention_reason: `Offer of ${pending.amount} for ${pending.listing.name}. It waits for the owner to confirm or decline.`,
    });
  }
  await admin.from("messenger_conversations").update(updates).eq("id", conversationId);

  if (pending) {
    await alertTeam(admin, businessId, {
      subject: `Offer to confirm: ${pending.amount} for ${pending.listing.name}`,
      lines: [
        ["Offer", pending.amount],
        ["Asking price", formatPeso(pending.listing.price_minor)],
        ["Property", `${pending.listing.name}, ${pending.listing.location}`],
        ["Next", "The owner or an admin confirms or declines it. Nothing is final until then."],
      ],
      url: `${opts.appOrigin}/app/inbox?c=${conversationId}`,
    });
  }

  if (agreed || clash) {
    const l = agreed?.listing;
    await alertTeam(admin, businessId, {
      subject: agreed ? `Deal agreed: ${agreed.amount} for ${agreed.listing.name}` : "A deal the AI agreed needs you",
      lines: agreed
        ? [
            ["Agreed price", agreed.amount],
            ["Reference no.", agreed.ref],
            ["Asking price", formatPeso(agreed.listing.price_minor)],
            ["Property", `${agreed.listing.name}, ${agreed.listing.location}`],
            ["How", "The buyer's offer met the price you pre-approved, so the AI agreed it."],
            ["Next", "Send the reservation agreement and official payment instructions in the chat. Mark the listing reserved when the fee is paid."],
          ]
        : [["What happened", clash!], ...(l ? ([["Property", l.name]] as Array<[string, string]>) : [])],
      url: `${opts.appOrigin}/app/inbox?c=${conversationId}`,
    });
  }

  if (result.viewing || result.handover) {
    const listing = props.find((p) => p.id === result.viewing?.listingId);
    await alertTeam(admin, businessId, {
      subject: result.viewing
        ? `New viewing request on ${opts.channelLabel}${listing ? `: ${listing.name}` : ""}`
        : `A ${opts.channelLabel} chat needs you: ${opts.sourceName}`,
      lines: result.viewing
        ? [
            ["Name", result.viewing.name],
            ["Mobile", result.viewing.phone],
            ["Property", listing ? `${listing.name}, ${listing.location}` : "Not said"],
            ["Preferred date", result.viewing.preferredDate ?? "Not given"],
          ]
        : [["Why", result.handover!]],
      url: `${opts.appOrigin}/app/inbox?c=${conversationId}`,
    });
  }
}

export async function flag(admin: NonNullable<ReturnType<typeof createAdminClient>>, conversationId: string, reason: string) {
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
