import Link from "next/link";
import { ShieldCheck, ShieldQuestion } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Textarea,
} from "@/components/ui";
import {
  REPORT_NOTICES,
  type Report,
  type ReportedListing,
  type TakenDown,
} from "@/lib/admin-reports";
import { formatPeso } from "@/lib/money";
import { ANY_REASON_LABEL } from "@/lib/seller-trust";

const when = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const CAPACITY: Record<string, string> = {
  owner: "the owner",
  broker: "a broker",
  agent: "an agent",
  developer: "the developer",
};

type Actions = {
  takeDown: (propertyId: string, form: FormData) => Promise<void>;
  dismissReport: (reportId: string, form: FormData) => Promise<void>;
  restoreListing: (propertyId: string) => Promise<void>;
};

function ReportRow({
  r,
  dismiss,
}: {
  r: Report;
  dismiss: Actions["dismissReport"];
}) {
  return (
    <li className="rounded-2xl bg-grape-50/60 p-3">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={r.source === "auto" ? "neutral" : "hot"}>
          {r.source === "auto" ? "App check" : "Visitor"}
        </Badge>
        <span className="font-semibold">
          {ANY_REASON_LABEL[r.reason] ?? r.reason}
        </span>
        <span className="text-xs text-muted">
          {when.format(new Date(r.created_at))}
        </span>
      </p>
      {r.details ? (
        <p className="mt-1.5 text-sm break-words whitespace-pre-line text-ink/85">
          {r.details}
        </p>
      ) : null}
      {r.contact ? (
        <p className="mt-1.5 text-sm text-ink/85">
          Reporter left a contact:{" "}
          <span className="font-semibold break-all">{r.contact}</span>
        </p>
      ) : null}
      <form
        action={dismiss.bind(null, r.id)}
        className="mt-2 flex flex-wrap items-end gap-2"
      >
        <div className="min-w-48 flex-1">
          <Label htmlFor={`note-${r.id}`} className="sr-only">
            Note for the record
          </Label>
          <Input
            id={`note-${r.id}`}
            name="note"
            maxLength={500}
            placeholder="Note for the record (optional)"
          />
        </div>
        <SubmitButton variant="secondary" pendingText="Closing…">
          Dismiss Report
        </SubmitButton>
      </form>
    </li>
  );
}

function ListingCard({ l, actions }: { l: ReportedListing; actions: Actions }) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold tracking-tight break-words">
            {l.name}
          </p>
          <p className="text-sm text-muted">
            {formatPeso(l.price_minor, l.currency)} · {l.location}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{l.seller}</span>
            {l.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-tile-mint px-2.5 py-0.5 text-xs font-bold text-brand-700">
                <ShieldCheck className="size-3.5" aria-hidden /> Verified seller
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-tile-lemon px-2.5 py-0.5 text-xs font-bold text-brass-700">
                <ShieldQuestion className="size-3.5" aria-hidden /> Not yet
                verified
              </span>
            )}
            <span className="text-muted">
              {l.capacity
                ? `Declared as ${CAPACITY[l.capacity] ?? l.capacity}${l.license ? `, no. ${l.license}` : l.capacity === "owner" ? "" : ", no licence number"}`
                : "No seller declaration (listed before it was asked for)"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
          {l.live ? (
            <Link
              href={`/l/${l.id}`}
              target="_blank"
              className="text-grape-700 underline underline-offset-2"
            >
              Open public page
            </Link>
          ) : (
            <span className="text-muted">Not public right now</span>
          )}
          <Link
            href={`/admin/accounts?q=${encodeURIComponent(l.seller)}`}
            className="text-grape-700 underline underline-offset-2"
          >
            Open the account
          </Link>
        </div>
      </div>

      <ul className="space-y-2">
        {l.reports.map((r) => (
          <ReportRow key={r.id} r={r} dismiss={actions.dismissReport} />
        ))}
      </ul>

      <details className="border-t border-line pt-4">
        <summary className="inline-flex cursor-pointer list-none rounded-full px-4 py-2.5 text-sm font-semibold text-hot hover:bg-hot-50 [&::-webkit-details-marker]:hidden">
          Take down listing…
        </summary>
        <form
          action={actions.takeDown.bind(null, l.id)}
          className="mt-3 space-y-3 rounded-2xl border border-hot/30 bg-hot-50 p-4"
        >
          <p className="text-sm text-ink">
            The listing leaves public pages and the Properties page at once, and
            its open reports are closed. Nothing is deleted, and you can put it
            back below. To stop the seller listing anything else, restrict their
            account in Accounts.
          </p>
          <div>
            <Label htmlFor={`reason-${l.id}`}>
              Reason (the seller sees this, in the app and by email)
            </Label>
            <Textarea
              id={`reason-${l.id}`}
              name="reason"
              rows={2}
              maxLength={500}
              required
            />
          </div>
          <SubmitButton variant="danger" pendingText="Taking down…">
            Take Down Listing
          </SubmitButton>
        </form>
      </details>
    </Card>
  );
}

/** The app admin's Reports screen: listings waiting for a look, and listings already taken down. */
export function ReportsView({
  listings,
  takenDown,
  notice,
  actions,
}: {
  listings: ReportedListing[];
  takenDown: TakenDown[];
  notice?: string;
  actions: Actions;
}) {
  const said = notice ? REPORT_NOTICES[notice] : undefined;
  const count = listings.reduce((n, l) => n + l.reports.length, 0);
  return (
    <>
      <PageHeader
        icon3d="eyes"
        tone="lemon"
        title="Reports"
        description="Listings a visitor reported, or that the app's own checks flagged for price, photos or wording. Look at each one, then dismiss the report or take the listing down. Sellers never see who reported them."
      />
      {said ? (
        <div className="mb-4">
          <Alert tone={said.tone}>{said.text}</Alert>
        </div>
      ) : null}

      {listings.length ? (
        <>
          <p className="mb-3 text-sm text-muted">
            {count} open {count === 1 ? "report" : "reports"} on{" "}
            {listings.length} {listings.length === 1 ? "listing" : "listings"},
            newest first
          </p>
          <ul className="space-y-4">
            {listings.map((l) => (
              <li key={l.id}>
                <ListingCard l={l} actions={actions} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState icon="party" tone="mint" title="No reports waiting">
          New reports show up here, and you get an email for each one.
        </EmptyState>
      )}

      {takenDown.length ? (
        <section className="mt-10" aria-labelledby="down-title">
          <h2 id="down-title" className="text-lg font-bold">
            Taken down
          </h2>
          <ul className="mt-3 space-y-3">
            {takenDown.map((t) => (
              <li key={t.id}>
                <Card className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold break-words">{t.name}</p>
                    <p className="text-sm text-muted">
                      {t.seller} · {when.format(new Date(t.at))}
                    </p>
                    <p className="mt-1 text-sm break-words text-ink/85">
                      {t.reason}
                    </p>
                  </div>
                  <form action={actions.restoreListing.bind(null, t.id)}>
                    <SubmitButton variant="secondary" pendingText="Restoring…">
                      Put Back on Public Pages
                    </SubmitButton>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
