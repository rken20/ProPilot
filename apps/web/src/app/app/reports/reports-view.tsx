import Link from "next/link";
import { Download } from "lucide-react";
import { buttonClass, cx } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { formatPeso } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/property-labels";
import { fmtDuration, PRESETS, type LeadsReport, type ListingPerf, type MessengerReport, type Range, type TeamRow } from "@/lib/reports";

/** Validated pair (dataviz validator, light surface): ProPilot buyers, Messenger. */
const SOURCE = { propilot: "#0b8a70", messenger: "#c97a10" } as const;

export function ReportsView({
  range,
  leads,
  listings,
  messenger,
  team,
  messengerOn,
}: {
  range: Range;
  leads: LeadsReport;
  listings: ListingPerf[];
  messenger: MessengerReport;
  team: TeamRow[] | null;
  messengerOn: boolean;
}) {
  const csv = (report: string) => `/app/reports/export?report=${report}&${range.key}`;
  return (
    <div className="pp-stagger space-y-10">
      <header style={{ "--i": 0 } as React.CSSProperties} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2rem] leading-tight font-medium">Reports</h1>
          <p className="mt-1.5 text-sm text-muted">{range.label}. Times are Manila time.</p>
        </div>
        <RangePicker range={range} />
      </header>

      <Section i={1} title="Leads and conversions" csv={csv("leads")}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="New inquiries" value={<CountUp value={leads.inquiries} />} note={`${leads.fromProPilot} from ProPilot buyers, ${leads.fromMessenger} on Messenger`} />
          <Tile label="Viewing requests" value={<CountUp value={leads.viewingRequests} />} note="From both sources" />
          <Tile
            label="Reached a viewing"
            value={leads.conversion === null ? "—" : `${leads.conversion}%`}
            note={`${leads.reachedViewing} scheduled or done, ${leads.closed} closed`}
          />
          <Tile label="First response" value={fmtDuration(leads.medianFirstResponseMs)} note="Median time to first contact a ProPilot buyer" />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Panel title="Inquiries over time">
            <SourceChart series={leads.series} />
          </Panel>
          <Panel title="Where leads are now">
            <Stages stages={leads.stages} />
          </Panel>
        </div>
      </Section>

      <Section i={2} title="Listing performance" csv={csv("listings")}>
        {listings.length ? (
          <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Listing</th>
                  <Th>Buyer saves</Th>
                  <Th>AI questions</Th>
                  <Th>Viewing requests</Th>
                  <Th>Facebook posts</Th>
                  <Th>Days listed</Th>
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.id} className="border-b border-line transition-colors last:border-0 hover:bg-surface">
                    <td className="px-4 py-3">
                      <Link href={`/app/properties/${l.id}`} className="font-medium text-ink hover:text-brand-700">
                        {l.name}
                      </Link>
                      <span className="block text-xs text-muted">
                        {l.location}, {formatPeso(l.price_minor)}, {STATUS_LABEL[l.status as keyof typeof STATUS_LABEL] ?? l.status}
                      </span>
                    </td>
                    <Td value={l.saves} />
                    <Td value={l.questions} />
                    <Td value={l.viewingRequests} strong />
                    <Td value={l.facebookPosts} />
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{l.daysOnMarket}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="Add a listing to see how it performs." />
        )}
        <p className="mt-2 text-xs text-muted">Counts are for the selected period. Days listed runs from when the listing was added to when it sold, or today.</p>
      </Section>

      <Section i={3} title="AI chat" csv={messengerOn ? csv("messenger") : undefined}>
        {messengerOn ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Conversations" value={<CountUp value={messenger.conversations} />} note={`${messenger.viewingRequests} became viewing requests`} />
            <Tile
              label="Handled by the AI alone"
              value={messenger.conversations ? `${Math.round((messenger.aiOnly / messenger.conversations) * 100)}%` : "—"}
              note={`${messenger.handedOver} handed to your team`}
            />
            <Tile label="After-hours answers" value={<CountUp value={messenger.afterHoursAnswered} />} note="Messages answered outside 8 am to 6 pm, or on Sundays" />
            <Tile
              label="Reply time"
              value={fmtDuration(messenger.medianAiReplyMs)}
              note={`AI median. Your team: ${fmtDuration(messenger.medianTeamReplyMs)}`}
            />
          </div>
        ) : (
          <Empty text="When buyers message you in ProPilot or on Messenger, the AI chat results show here." />
        )}
      </Section>

      {team ? (
        <Section i={4} title="Team" csv={csv("team")}>
          <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-[var(--shadow-card)]">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <Th>Listings</Th>
                  <Th>Leads responded to</Th>
                  <Th>First response</Th>
                  <Th>Viewings</Th>
                  <Th>Closed</Th>
                  <Th>Chat replies</Th>
                </tr>
              </thead>
              <tbody>
                {team.map((t) => (
                  <tr key={t.userId} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium text-ink">{t.name}</span>
                      <span className="block text-xs capitalize text-muted">{t.role}</span>
                    </td>
                    <Td value={t.listings} />
                    <Td value={t.responded} strong />
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{fmtDuration(t.medianResponseMs)}</td>
                    <Td value={t.viewings} />
                    <Td value={t.closed} />
                    <Td value={t.messengerReplies} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            A lead counts for the person who first changed its status. Assign listings to agents on each property to see leads per agent in the CSV.
          </p>
        </Section>
      ) : null}
    </div>
  );
}

function RangePicker({ range }: { range: Range }) {
  const custom = range.key.startsWith("from=");
  const [from, to] = custom ? range.key.match(/\d{4}-\d{2}-\d{2}/g)! : ["", ""];
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <nav aria-label="Period" className="flex flex-wrap gap-1 rounded-xl bg-zinc-100 p-1 text-sm">
        {PRESETS.map(([k, label]) => (
          <Link
            key={k}
            href={`/app/reports?range=${k}`}
            aria-current={range.key === `range=${k}` ? "page" : undefined}
            className={cx(
              "rounded-lg px-3 py-1.5 font-medium transition-colors",
              range.key === `range=${k}` ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form action="/app/reports" className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="r-from" className="text-muted">
          From
        </label>
        <input id="r-from" type="date" name="from" defaultValue={from} required className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5" />
        <label htmlFor="r-to" className="text-muted">
          to
        </label>
        <input id="r-to" type="date" name="to" defaultValue={to} required className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5" />
        <button className={buttonClass("secondary", "px-3 py-1.5")}>Show</button>
      </form>
    </div>
  );
}

function Section({ i, title, csv, children }: { i: number; title: string; csv?: string; children: React.ReactNode }) {
  return (
    <section style={{ "--i": i } as React.CSSProperties} aria-labelledby={`report-${i}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id={`report-${i}`} className="font-display text-2xl font-medium">
          {title}
        </h2>
        {csv ? (
          <a href={csv} className={buttonClass("ghost", "px-3 py-1.5")} download>
            <Download className="size-4" aria-hidden /> Download CSV
          </a>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: React.ReactNode; note: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-display mt-2 text-[1.9rem] leading-none font-medium tabular-nums text-ink">{value}</p>
      <p className="mt-2 text-xs leading-snug text-muted">{note}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)]">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-line bg-white/60 px-5 py-8 text-center text-sm text-muted">{text}</p>;
}

const Th = ({ children }: { children: React.ReactNode }) => <th className="px-4 py-3 text-right font-medium">{children}</th>;
const Td = ({ value, strong }: { value: number; strong?: boolean }) => (
  <td className={cx("px-4 py-3 text-right tabular-nums", value ? (strong ? "font-semibold text-ink" : "text-ink") : "text-zinc-400")}>{value}</td>
);

/** Stacked columns, ProPilot buyers under Messenger, with a 2px surface gap and a legend. */
function SourceChart({ series }: { series: LeadsReport["series"] }) {
  const max = Math.max(1, ...series.map((s) => s.propilot + s.messenger));
  const top = niceMax(max);
  const ticks = [0, top / 2, top];
  // Label every few bars so dates never collide (each label needs about four bars of room).
  const every = Math.max(1, Math.ceil(series.length / 6));
  return (
    <figure>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted">
        <Legend color={SOURCE.propilot} label="ProPilot buyers" />
        <Legend color={SOURCE.messenger} label="Messenger" />
      </div>
      <div className="relative flex h-48 gap-[2px] pl-8" aria-hidden="true">
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-8 border-t border-zinc-100" style={{ bottom: `${(t / top) * 100}%` }}>
            <span className="absolute -left-8 -translate-y-1/2 text-[11px] tabular-nums text-muted">{t}</span>
          </div>
        ))}
        {series.map((s) => {
          const total = s.propilot + s.messenger;
          return (
            <div
              key={s.label}
              title={`${s.label}: ${s.propilot} ProPilot, ${s.messenger} Messenger`}
              className="group relative flex h-full flex-1 flex-col justify-end"
            >
              <div className="mx-auto flex w-full max-w-6 flex-col justify-end gap-[2px] transition-opacity group-hover:opacity-80" style={{ height: `${(total / top) * 100}%` }}>
                {s.messenger ? <div className="rounded-t" style={{ flexGrow: s.messenger, background: SOURCE.messenger }} /> : null}
                {s.propilot ? (
                  <div className={cx(!s.messenger && "rounded-t")} style={{ flexGrow: s.propilot, background: SOURCE.propilot }} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-[2px] pl-8 text-[11px] text-muted" aria-hidden="true">
        {series.map((s, i) => (
          <span key={s.label} className="relative h-4 flex-1">
            {i % every === 0 ? (
              <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{s.label.replace("Wk of ", "")}</span>
            ) : null}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Inquiries per period by source</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>ProPilot buyers</th>
            <th>Messenger</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.label}>
              <td>{s.label}</td>
              <td>{s.propilot}</td>
              <td>{s.messenger}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function Stages({ stages }: { stages: LeadsReport["stages"] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <ul className="space-y-3">
      {stages.map((s) => (
        <li key={s.label} className="text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-ink">{s.label}</span>
            <span className="tabular-nums font-semibold text-ink">{s.value}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-zinc-100">
            <div className="pp-grow h-2 rounded-full bg-brand-600" style={{ width: `${(s.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function niceMax(n: number): number {
  if (n <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= n) return m * step % 2 === 0 ? m * step : Math.ceil((m * step) / 2) * 2;
  return n;
}
