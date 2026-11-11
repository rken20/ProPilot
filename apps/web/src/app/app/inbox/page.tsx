import { redirect } from "next/navigation";
import { can } from "@propilot/shared";
import { Card, PageHeader } from "@/components/ui";
import { requireBusiness } from "@/lib/auth";
import { businessPages } from "@/lib/facebook-pages";
import { metaConfig } from "@/lib/meta";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { InboxView, type Conversation, type Message } from "./inbox-view";

export default async function InboxPage({ searchParams }: PageProps<"/app/inbox">) {
  const sp = await searchParams;
  const biz = await requireBusiness();
  if (!can(biz.role, "conversation.reply")) redirect("/app");

  if (!metaConfig()) {
    return (
      <>
        <PageHeader title="Messenger" />
        <Card>
          <p className="text-sm text-muted">Messenger isn&apos;t switched on for ProPilot yet.</p>
        </Card>
      </>
    );
  }

  const supabase = await createClient();
  const [pages, { data: convRows }] = await Promise.all([
    businessPages(biz.businessId),
    supabase
      .from("messenger_conversations")
      .select(
        "id, psid, display_name, mode, needs_attention, attention_reason, lead_name, lead_phone, lead_date, lead_notes, lead_status, property_id, last_inbound_at, last_message_at, last_read_at, page_row_id",
      )
      .eq("business_id", biz.businessId)
      .order("last_message_at", { ascending: false })
      .limit(100),
  ]);
  const conversations = (convRows ?? []) as Conversation[];
  const live = pages.filter((p) => p.messenger_enabled);
  const pageName = new Map(pages.map((p) => [p.id, p.name]));

  const selectedId = typeof sp.c === "string" ? sp.c : undefined;
  const selected = conversations.find((c) => c.id === selectedId);

  const { data: recent } = conversations.length
    ? await supabase
        .from("messenger_messages")
        .select("id, conversation_id, sender, body, created_at")
        .in(
          "conversation_id",
          conversations.slice(0, 50).map((c) => c.id),
        )
        .order("created_at", { ascending: false })
        .limit(300)
    : { data: [] };
  const lastByConv = new Map<string, Message>();
  for (const m of (recent ?? []) as Message[]) if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);

  let thread: Message[] = [];
  let listingName: string | null = null;
  if (selected) {
    const [{ data: msgs }, { data: prop }] = await Promise.all([
      supabase
        .from("messenger_messages")
        .select("id, conversation_id, sender, body, created_at")
        .eq("conversation_id", selected.id)
        .order("created_at")
        .limit(300),
      selected.property_id
        ? supabase.from("properties").select("name, location").eq("id", selected.property_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    thread = (msgs ?? []) as Message[];
    listingName = prop ? `${prop.name}, ${prop.location}` : null;
    // Opening a conversation marks it read.
    await createAdminClient()?.from("messenger_conversations").update({ last_read_at: new Date().toISOString() }).eq("id", selected.id);
  }

  return (
    <InboxView
      liveNames={live.map((p) => p.name)}
      canConnect={can(biz.role, "facebook.connect")}
      conversations={conversations}
      lastByConv={Object.fromEntries(lastByConv)}
      selected={selected ?? null}
      thread={thread}
      listingName={listingName}
      pageNames={Object.fromEntries(pageName)}
    />
  );
}
