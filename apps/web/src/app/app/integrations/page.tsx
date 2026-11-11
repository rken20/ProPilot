import { CalendarDays, FileSpreadsheet, Mail, type LucideIcon } from "lucide-react";
import { businessPages } from "@/lib/facebook-pages";
import { canPublish } from "@/lib/meta";
import { missingMetaSettings } from "@/lib/meta-oauth";
import { can } from "@propilot/shared";
import { Alert, Badge, PageHeader, buttonClass, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireBusiness } from "@/lib/auth";
import { emailProvider } from "@/lib/email";
import { CALENDAR_SCOPE, SHEETS_SCOPE } from "@/lib/google";
import { missingGoogleSettings } from "@/lib/google-oauth";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/time";
import { createLeadsSheet, disconnectFacebookPage, disconnectGoogle, stopSheetSync, syncSheetNow } from "./actions";

const NOTICES: Record<string, [tone: "success" | "error" | "info", text: string]> = {
  "google-connected": ["success", "Google is connected."],
  "google-disconnected": ["success", "Google is disconnected and ProPilot's access was revoked."],
  "google-cancelled": ["info", "Google connection was cancelled."],
  "google-failed": ["error", "Couldn't connect Google. Please try again."],
  "google-no-refresh": [
    "error",
    "Google didn't grant ongoing access. Remove ProPilot AI at myaccount.google.com/permissions, then connect again.",
  ],
  "google-not-ready": ["error", "Connect Google isn't switched on for ProPilot yet."],
  "connect-first": ["error", "Connect your Google account first."],
  "sheet-created": ["success", "Your leads sheet is ready in Google Drive. New leads are added automatically."],
  "sheet-failed": ["error", "Couldn't create the sheet. Check that the Google Sheets API is enabled, then try again."],
  "sheet-synced": ["success", "Sheet updated."],
  "sheet-stopped": ["success", "Sheet sync is off. The sheet stays in Google Drive."],
  "not-allowed": ["error", "Only the owner or an admin can change this."],
  "facebook-connected": ["success", "Facebook is connected. Your Pages are listed below."],
  "facebook-disconnected": ["success", "The Page is disconnected and its access token deleted."],
  "facebook-cancelled": ["info", "Facebook connection was cancelled."],
  "facebook-failed": ["error", "Couldn't connect Facebook. Please try again."],
  "facebook-no-pages": [
    "error",
    "Facebook didn't share any Pages. Connect again and tick the Pages you manage. Pages need you as an admin or editor.",
  ],
  "facebook-not-ready": ["error", "Connect Facebook isn't switched on for ProPilot yet."],
};

export default async function IntegrationsPage({ searchParams }: PageProps<"/app/integrations">) {
  const sp = await searchParams;
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice] : undefined;
  const biz = await requireBusiness();
  const supabase = await createClient();
  const [{ data: connRows }, { data: integ }, pages] = await Promise.all([
    supabase.rpc("my_google_connection"),
    supabase.from("business_integrations").select("sheets_user_id, spreadsheet_url, sheets_synced_at").eq("business_id", biz.businessId).maybeSingle(),
    businessPages(biz.businessId),
  ]);
  const metaMissing = missingMetaSettings();
  const manageFacebook = can(biz.role, "facebook.connect");
  const conn = (connRows as Array<{ google_email: string; scopes: string[]; has_calendar: boolean }> | null)?.[0] ?? null;
  const missing = missingGoogleSettings();
  const googleReady = missing.length === 0;
  const manage = can(biz.role, "business.update");
  const email = emailProvider();
  const syncing = Boolean(integ?.sheets_user_id && integ.spreadsheet_url);

  return (
    <>
      <PageHeader title="Integrations" description="Connect the tools your team already uses." />
      {notice ? (
        <div className="mb-6">
          <Alert tone={notice[0]}>{notice[1]}</Alert>
        </div>
      ) : null}

      <div className="space-y-4">
        <Panel
          icon={FacebookIcon}
          title="Facebook Pages"
          status={pages.length ? <Badge tone="brand">{pages.length === 1 ? "1 Page" : `${pages.length} Pages`}</Badge> : <Badge>Not connected</Badge>}
        >
          {metaMissing.length ? (
            <p>
              Connect Facebook isn&apos;t switched on yet.{" "}
              {manageFacebook ? <span className="text-muted">Missing server settings: {metaMissing.join(", ")}.</span> : null}
            </p>
          ) : (
            <div className="space-y-4">
              <p>
                Turn your Page posts into listings, and post listings to your Page. ProPilot only posts when someone on
                your team presses Post.
              </p>
              {pages.length ? (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {pages.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{p.name}</p>
                        <p className="text-xs text-muted">
                          {canPublish(p.tasks) ? "Can read and post" : "Read only: you need to be an admin or editor of this Page to post"}
                          , connected {timeAgo(p.connected_at)}
                        </p>
                      </div>
                      {manageFacebook ? (
                        <form action={disconnectFacebookPage.bind(null, p.id)}>
                          <SubmitButton variant="ghost" pendingText="Disconnecting…">
                            Disconnect
                          </SubmitButton>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {manageFacebook ? (
                <a href="/api/meta/connect" className={buttonClass(pages.length ? "secondary" : "primary")}>
                  {pages.length ? "Add or change Pages" : "Connect Facebook Page"}
                </a>
              ) : (
                <p className="text-muted">The owner or an admin can connect the business&apos;s Pages.</p>
              )}
            </div>
          )}
        </Panel>

        <Panel icon={Mail} title="Email alerts" status={email ? <Badge tone="brand">On</Badge> : <Badge>Not set up</Badge>}>
          <p>
            {email
              ? "The owner, admins and agents get an email the moment a buyer requests a viewing, with the buyer's mobile number and a link to the lead."
              : "Lead emails start once an email sender is added to ProPilot's settings. Leads still arrive in Buyer leads."}
          </p>
        </Panel>

        <Panel
          icon={GoogleIcon}
          title="Google account"
          status={conn ? <Badge tone="brand">Connected</Badge> : <Badge>Not connected</Badge>}
        >
          {!googleReady ? (
            <p>
              Connect Google isn&apos;t switched on yet.{" "}
              {manage ? <span className="text-muted">Missing server settings: {missing.join(", ")}.</span> : null}
            </p>
          ) : conn ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>
                Connected as <span className="font-medium text-ink">{conn.google_email}</span>. ProPilot can only see files and
                calendars it created.
              </p>
              <form action={disconnectGoogle}>
                <SubmitButton variant="secondary" pendingText="Disconnecting…">
                  Disconnect
                </SubmitButton>
              </form>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>Link your Google account to sync leads to Sheets and viewings to Calendar.</p>
              <a href="/api/google/connect" className={buttonClass()}>
                Connect Google
              </a>
            </div>
          )}
        </Panel>

        <Panel
          icon={FileSpreadsheet}
          title="Google Sheets: live leads sheet"
          status={syncing ? <Badge tone="brand">Syncing</Badge> : <Badge>Off</Badge>}
        >
          {syncing ? (
            <div className="space-y-3">
              <p>
                Every lead is kept in one sheet for the whole team
                {integ?.sheets_synced_at ? `, last updated ${timeAgo(integ.sheets_synced_at)}` : ""}.
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={integ!.spreadsheet_url!} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
                  Open sheet
                </a>
                {manage ? (
                  <>
                    <form action={syncSheetNow}>
                      <SubmitButton variant="secondary" pendingText="Updating…">
                        Update now
                      </SubmitButton>
                    </form>
                    <form action={stopSheetSync}>
                      <SubmitButton variant="ghost" pendingText="Stopping…">
                        Stop syncing
                      </SubmitButton>
                    </form>
                  </>
                ) : null}
              </div>
            </div>
          ) : manage ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>Create a sheet in your Google Drive that updates itself with every new lead and status change.</p>
              {conn?.scopes.includes(SHEETS_SCOPE) ? (
                <form action={createLeadsSheet}>
                  <SubmitButton pendingText="Creating…">Create leads sheet</SubmitButton>
                </form>
              ) : (
                <span className="text-sm text-muted">Connect Google first.</span>
              )}
            </div>
          ) : (
            <p>The owner or an admin can turn this on. You can still use Export CSV in Buyer leads.</p>
          )}
        </Panel>

        <Panel
          icon={CalendarDays}
          title="Google Calendar: viewings"
          status={conn?.scopes.includes(CALENDAR_SCOPE) ? <Badge tone="brand">On for you</Badge> : <Badge>Off</Badge>}
        >
          <p>
            {conn?.scopes.includes(CALENDAR_SCOPE)
              ? "When you set a viewing time on a lead, it's added to a “ProPilot viewings” calendar in your Google Calendar, with a reminder an hour before. Changes and cancellations update it too."
              : "Connect Google to add viewings to your calendar automatically. Until then, use “Add to Google Calendar” on any lead."}
          </p>
        </Panel>
      </div>
    </>
  );
}

function Panel({ icon: Icon, title, status, children }: { icon: LucideIcon | typeof GoogleIcon | typeof FacebookIcon; title: string; status: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Icon className="size-5" aria-hidden />
        </span>
        <h2 className="flex-1 font-semibold">{title}</h2>
        {status}
      </div>
      <div className={cx("mt-3 text-sm text-ink/80 sm:pl-[52px]")}>{children}</div>
    </section>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cx("grid place-items-center rounded-full border border-current text-[12px] font-bold", className)}>
      f
    </span>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cx("grid place-items-center rounded-full border border-current text-[11px] font-bold", className)}>
      G
    </span>
  );
}
