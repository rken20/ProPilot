import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/lib/app-chat-shared";
import { BuyerChat } from "./buyer-chat";

export default async function BuyerChatPage({ params }: PageProps<"/buyer/messages/[id]">) {
  await requireUser();
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
      <BuyerChat conversationId={id} businessName={conv.business_name} initial={(msgs ?? []) as ChatMessage[]} />
    </>
  );
}
