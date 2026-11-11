import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Alert, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";

type Row = {
  id: string;
  business_name: string;
  property_name: string | null;
  last_message_at: string;
  last_message: string | null;
  last_sender: string | null;
};

export default async function BuyerMessages({ searchParams }: PageProps<"/buyer/messages">) {
  await requireUser();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_app_conversations");
  const rows = (data ?? []) as Row[];

  return (
    <>
      <h1 className="font-display text-[2.25rem] leading-tight font-medium">Messages</h1>
      <p className="mt-1.5 text-muted">Your chats with agents. An AI assistant answers first, and the agent can join anytime.</p>
      {sp.notice === "unavailable" ? (
        <div className="mt-5">
          <Alert>That listing isn&apos;t available for messages right now.</Alert>
        </div>
      ) : null}
      <div className="mt-7">
        {rows.length ? (
          <ul className="pp-stagger overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
            {rows.map((r, i) => (
              <li key={r.id} style={{ "--i": Math.min(i, 8) } as React.CSSProperties} className="border-b border-line last:border-0">
                <Link href={`/buyer/messages/${r.id}`} className="flex gap-3 px-5 py-4 transition-colors hover:bg-surface">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 font-semibold text-brand-700" aria-hidden>
                    {r.business_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate font-medium text-ink">{r.business_name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted">{timeAgo(r.last_message_at)}</span>
                    </span>
                    {r.property_name ? <span className="block truncate text-xs text-muted">About {r.property_name}</span> : null}
                    <span className="mt-0.5 block truncate text-sm text-muted">
                      {r.last_sender === "buyer" ? "You: " : ""}
                      {r.last_message ?? "No messages yet"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="text-center">
            <MessageCircle className="mx-auto size-8 text-zinc-400" aria-hidden />
            <p className="mt-3 font-medium">No messages yet</p>
            <p className="mt-1 text-sm text-muted">Open a listing and press Message the agent to start a chat.</p>
            <Link href="/buyer" className="mt-4 inline-block text-sm font-semibold text-brand-700">
              Browse listings
            </Link>
          </Card>
        )}
      </div>
    </>
  );
}
