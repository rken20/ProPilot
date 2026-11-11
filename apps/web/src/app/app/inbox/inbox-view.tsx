import Link from "next/link";
import { Bot, MessageCircle, UserRound } from "lucide-react";
import { Badge, Card, PageHeader, buttonClass, cx } from "@/components/ui";
import { RefreshSoon } from "@/components/refresh-soon";
import { SubmitButton } from "@/components/submit-button";
import { withinReplyWindow } from "@/lib/messenger-window";
import { timeAgo } from "@/lib/time";
import { setConversationMode, setLeadStatus } from "./actions";
import { Composer } from "./composer";

export type Conversation = {
  id: string;
  psid: string;
  display_name: string | null;
  mode: "ai" | "human";
  needs_attention: boolean;
  attention_reason: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_date: string | null;
  lead_notes: string | null;
  lead_status: string;
  property_id: string | null;
  last_inbound_at: string | null;
  last_message_at: string;
  last_read_at: string | null;
  page_row_id: string;
};
export type Message = {
  id: string;
  conversation_id: string;
  sender: "buyer" | "ai" | "agent" | "page";
  body: string;
  created_at: string;
};

const nameOf = (c: Conversation) => c.display_name || c.lead_name || `Messenger user ${c.psid.slice(-4)}`;

/** The Messenger inbox: conversation list, the open thread, and its viewing request. */
export function InboxView({
  liveNames,
  canConnect,
  conversations,
  lastByConv: lastMap,
  selected,
  thread,
  listingName,
  pageNames,
}: {
  liveNames: string[];
  canConnect: boolean;
  conversations: Conversation[];
  lastByConv: Record<string, Message>;
  selected: Conversation | null;
  thread: Message[];
  listingName: string | null;
  pageNames: Record<string, string>;
}) {
  const lastByConv = new Map(Object.entries(lastMap));
  const pageName = new Map(Object.entries(pageNames));
  const live = liveNames.map((name) => ({ name }));
  const unread = (c: Conversation) => {
    const last = lastByConv.get(c.id);
    return last?.sender === "buyer" && (!c.last_read_at || c.last_read_at < last.created_at);
  };

  return (
    <>
      <PageHeader
        title="Messenger"
        description={
          live.length
            ? `The AI answers messages to ${live.map((p) => p.name).join(" and ")} until someone takes over.`
            : "Turn on AI replies for a Page in Integrations to start."
        }
      />
      <RefreshSoon every={8000} times={150} />

      {!live.length ? (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">No Page has AI replies switched on yet.</p>
          {canConnect ? (
            <Link href="/app/integrations" className={buttonClass("primary")}>
              Open Integrations
            </Link>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <section aria-label="Conversations" className={cx(selected && "max-lg:hidden")}>
          {conversations.length ? (
            <ul className="pp-stagger overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
              {conversations.map((c, i) => {
                const last = lastByConv.get(c.id);
                return (
                  <li key={c.id} style={{ "--i": Math.min(i, 8) } as React.CSSProperties} className="border-b border-line last:border-0">
                    <Link
                      href={`/app/inbox?c=${c.id}`}
                      className={cx("flex gap-3 px-4 py-3.5 transition-colors hover:bg-surface", c.id === selected?.id && "bg-brand-50")}
                    >
                      <span
                        className={cx(
                          "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold",
                          c.mode === "ai" ? "bg-brand-50 text-brand-700" : "bg-brass-50 text-[#7d5f26]",
                        )}
                        aria-hidden
                      >
                        {nameOf(c).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cx("truncate text-sm", unread(c) ? "font-bold text-ink" : "font-medium text-ink")}>
                            {nameOf(c)}
                          </span>
                          {c.needs_attention ? <span className="size-2 shrink-0 rounded-full bg-hot" title="Needs a person" /> : null}
                          <span className="ml-auto shrink-0 text-xs text-muted">{timeAgo(c.last_message_at)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-muted">
                          {last ? `${last.sender === "buyer" ? "" : last.sender === "ai" ? "AI: " : "You: "}${last.body}` : ""}
                        </span>
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge tone={c.mode === "ai" ? "brand" : "neutral"}>{c.mode === "ai" ? "AI replying" : "Team replying"}</Badge>
                          {c.lead_status !== "none" ? <Badge tone="hot">Viewing: {c.lead_status}</Badge> : null}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Card className="text-center">
              <MessageCircle className="mx-auto size-8 text-zinc-400" aria-hidden />
              <p className="mt-3 font-medium">No messages yet</p>
              <p className="mt-1 text-sm text-muted">When someone messages your Page, the conversation shows up here.</p>
            </Card>
          )}
        </section>

        {selected ? (
          <section aria-label={`Conversation with ${nameOf(selected)}`} className="min-w-0">
            <Link href="/app/inbox" className="mb-3 inline-block text-sm text-muted hover:text-ink lg:hidden">
              ← All conversations
            </Link>
            <div className="rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-2xl font-medium">{nameOf(selected)}</h2>
                  <p className="text-sm text-muted">On {pageName.get(selected.page_row_id) ?? "your Page"}</p>
                </div>
                {selected.mode === "ai" ? (
                  <form action={setConversationMode.bind(null, selected.id, "human")}>
                    <SubmitButton variant="secondary" pendingText="Taking over…">
                      <UserRound className="size-4" aria-hidden /> Take over
                    </SubmitButton>
                  </form>
                ) : (
                  <form action={setConversationMode.bind(null, selected.id, "ai")}>
                    <SubmitButton variant="secondary" pendingText="Handing back…">
                      <Bot className="size-4" aria-hidden /> Let AI reply
                    </SubmitButton>
                  </form>
                )}
              </div>

              {selected.needs_attention && selected.attention_reason ? (
                <p className="pp-fade border-b border-line bg-[#f8ebe4] px-5 py-2.5 text-sm text-hot">{selected.attention_reason}</p>
              ) : null}

              <ol className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-5" aria-live="polite">
                {thread.map((m) => {
                  const mine = m.sender !== "buyer";
                  return (
                    <li key={m.id} className={cx("pp-fade flex flex-col", mine ? "items-end" : "items-start")}>
                      <p
                        className={cx(
                          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                          m.sender === "buyer" && "rounded-bl-md bg-zinc-100 text-ink",
                          m.sender === "ai" && "rounded-br-md bg-brand-50 text-brand-900",
                          (m.sender === "agent" || m.sender === "page") && "rounded-br-md bg-brand-600 text-white",
                        )}
                      >
                        {m.body}
                      </p>
                      <span className="mt-1 px-1 text-[11px] text-muted">
                        {m.sender === "ai"
                          ? "AI assistant"
                          : m.sender === "agent"
                            ? "Your team"
                            : m.sender === "page"
                              ? "From Facebook inbox"
                              : nameOf(selected)}
                        {", "}
                        {timeAgo(m.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ol>

              <div className="border-t border-line px-5 py-4">
                <Composer conversationId={selected.id} open={withinReplyWindow(selected.last_inbound_at)} aiOn={selected.mode === "ai"} />
              </div>
            </div>

            {selected.lead_status !== "none" ? (
              <Card className="mt-5">
                <h3 className="font-display text-xl font-medium">Viewing request</h3>
                <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <Row k="Name" v={selected.lead_name} />
                  <Row k="Mobile" v={selected.lead_phone} />
                  <Row k="Property" v={listingName} />
                  <Row k="Preferred date" v={selected.lead_date} />
                  {selected.lead_notes ? <Row k="Notes" v={selected.lead_notes} /> : null}
                </dl>
                <form action={setLeadStatus.bind(null, selected.id)} className="mt-4 flex flex-wrap items-center gap-2">
                  <label htmlFor="lead-status" className="text-sm font-medium">
                    Status
                  </label>
                  <select
                    id="lead-status"
                    name="status"
                    defaultValue={selected.lead_status}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="scheduled">Viewing scheduled</option>
                    <option value="closed">Closed</option>
                  </select>
                  <SubmitButton variant="secondary" pendingText="Saving…">
                    Save
                  </SubmitButton>
                </form>
              </Card>
            ) : null}
          </section>
        ) : (
          <div className="hidden place-items-center rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted lg:grid">
            Pick a conversation to read it and reply.
          </div>
        )}
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div>
      <dt className="text-muted">{k}</dt>
      <dd className="font-medium text-ink">{v || "Not given"}</dd>
    </div>
  );
}
