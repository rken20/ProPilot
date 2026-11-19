import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/lib/app-chat-shared";
import { BuyerChat } from "./buyer-chat";
import { aiEnabled, buyerAiEnabled } from "@/lib/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { BuyerUpgradeNote } from "../../upgrade-note";

export default async function BuyerChatPage({ params }: PageProps<"/buyer/messages/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: convs }, { data: msgs }] = await Promise.all([
    supabase.rpc("my_app_conversations"),
    supabase.rpc("my_app_messages", { p_conversation: id }),
  ]);
  const conv = ((convs ?? []) as Array<{ id: string; business_name: string; property_id: string | null; property_name: string | null }>).find(
    (c) => c.id === id,
  );
  if (!conv) notFound();
  // Instant AI replies need both the business and the buyer on Basic.
  const admin = createAdminClient();
  const { data: row } = admin
    ? await admin.from("messenger_conversations").select("business_id").eq("id", id).eq("buyer_id", user.id).eq("channel", "app").maybeSingle()
    : { data: null };
  const instantReplies = Boolean(row) && (await aiEnabled(row!.business_id as string)) && (await buyerAiEnabled(user.id));

  return (
    <>
      <Link href="/buyer/messages" className="text-sm text-muted hover:text-ink">
        ← Messages
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[2rem] leading-tight font-medium">{conv.business_name}</h1>
          {conv.property_id && conv.property_name ? (
            <Link href={`/buyer/listings/${conv.property_id}`} className="text-sm text-brand-700 hover:underline">
              About {conv.property_name}
            </Link>
          ) : null}
        </div>
      </div>
      {!instantReplies && (await aiEnabled((row?.business_id as string) ?? "")) ? (
        <div className="mt-6">
          <BuyerUpgradeNote title="Get instant AI replies">
            On Basic, {conv.business_name}&apos;s AI assistant answers right away, day or night. Until then, an agent replies here.
          </BuyerUpgradeNote>
        </div>
      ) : null}
      <BuyerChat conversationId={id} businessName={conv.business_name} initial={(msgs ?? []) as ChatMessage[]} instantReplies={instantReplies} />
    </>
  );
}
