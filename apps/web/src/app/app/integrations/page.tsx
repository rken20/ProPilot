import { appSay } from "@/lib/lang-server";
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
import { createLeadsSheet, disconnectFacebookPage, disconnectGoogle, setMessenger, stopSheetSync, syncSheetNow } from "./actions";

const NOTICES: Record<string, [tone: "success" | "error" | "info", english: string, taglish: string]> = {
  "google-connected": ["success", "Google is connected.", "Naka-connect na ang Google."],
  "google-disconnected": ["success", "Google is disconnected and MyHomeSeller's access was revoked.", "Na-disconnect na ang Google at tinanggal na ang access ng MyHomeSeller."],
  "google-cancelled": ["info", "Google connection was cancelled.", "Na-cancel ang pag-connect sa Google."],
  "google-failed": ["error", "Couldn't connect Google. Please try again.", "Hindi na-connect ang Google. Paki-try ulit."],
  "google-no-refresh": [
    "error",
    "Google didn't grant ongoing access. Remove MyHomeSeller at myaccount.google.com/permissions, then connect again.", "Hindi nagbigay ng tuloy-tuloy na access ang Google. I-remove ang MyHomeSeller sa myaccount.google.com/permissions, tapos mag-connect ulit.",
  ],
  "google-not-ready": ["error", "Connect Google isn't switched on for MyHomeSeller yet.", "Hindi pa naka-on ang Connect Google para sa MyHomeSeller."],
  "connect-first": ["error", "Connect your Google account first.", "I-connect muna ang Google account mo."],
  "sheet-created": ["success", "Your leads sheet is ready in Google Drive. New leads are added automatically.", "Ready na ang leads sheet mo sa Google Drive. Kusang madadagdag ang mga bagong lead."],
  "sheet-failed": ["error", "Couldn't create the sheet. Check that the Google Sheets API is enabled, then try again.", "Hindi nagawa ang sheet. I-check kung naka-enable ang Google Sheets API, tapos subukan ulit."],
  "sheet-synced": ["success", "Sheet updated.", "Na-update na ang sheet."],
  "sheet-stopped": ["success", "Sheet sync is off. The sheet stays in Google Drive.", "Naka-off na ang sheet sync. Mananatili ang sheet sa Google Drive."],
  "not-allowed": ["error", "Only the owner or an admin can change this.", "Owner o admin lang ang pwedeng magpalit nito."],
  "facebook-connected": ["success", "Facebook is connected. Your Pages are listed below.", "Naka-connect na ang Facebook. Nakalista sa baba ang Pages mo."],
  "facebook-disconnected": ["success", "The Page is disconnected and its access token deleted.", "Na-disconnect na ang Page at na-delete na ang access token nito."],
  "facebook-cancelled": ["info", "Facebook connection was cancelled.", "Na-cancel ang pag-connect sa Facebook."],
  "facebook-failed": ["error", "Couldn't connect Facebook. Please try again.", "Hindi na-connect ang Facebook. Paki-try ulit."],
  "facebook-no-pages": [
    "error",
    "Facebook didn't share any Pages. Connect again and tick the Pages you manage. Pages need you as an admin or editor.", "Walang Page na shinare ang Facebook. Mag-connect ulit at i-tick ang Pages na mina-manage mo. Kailangan admin o editor ka ng Page.",
  ],
  "facebook-not-ready": ["error", "Connect Facebook isn't switched on for MyHomeSeller yet.", "Hindi pa naka-on ang Connect Facebook para sa MyHomeSeller."],
  "messenger-on": ["success", "AI replies are on. New Messenger messages to this Page get an answer, and show up in Messenger.", "Naka-on na ang AI replies. Sasagutin ang mga bagong Messenger message sa Page na ito, at lalabas ang mga ito sa Messages."],
  "messenger-off": ["success", "AI replies are off for this Page. Messages stay in Facebook's own inbox.", "Naka-off na ang AI replies para sa Page na ito. Mananatili ang messages sa sariling inbox ng Facebook."],
  "messenger-permission": [
    "error",
    "Facebook didn't allow Messenger for this Page yet. Press Add or change Pages and allow the messaging permissions, then try again.", "Hindi pa pinapayagan ng Facebook ang Messenger para sa Page na ito. Pindutin ang Add or change Pages at i-allow ang messaging permissions, tapos subukan ulit.",
  ],
  "messenger-failed": ["error", "Couldn't switch on Messenger for this Page. Please try again.", "Hindi na-on ang Messenger para sa Page na ito. Paki-try ulit."],
};

export default async function IntegrationsPage({ searchParams }: PageProps<"/app/integrations">) {
  const sp = await searchParams;
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice] : undefined;
  const biz = await requireBusiness();
  const say = await appSay();
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
      <PageHeader title="Integrations" description={say("Connect the tools your team already uses.", "I-connect ang tools na gamit na ng team mo.")} />
      {notice ? (
        <div className="mb-6">
          <Alert tone={notice[0]}>{say(notice[1], notice[2])}</Alert>
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
              {say("Connect Facebook isn't switched on yet.", "Hindi pa naka-on ang Connect Facebook.")}{" "}
              {manageFacebook ? <span className="text-muted">{say("Missing server settings:", "Kulang na server settings:")} {metaMissing.join(", ")}.</span> : null}
            </p>
          ) : (
            <div className="space-y-4">
              <p>
                {say("Turn your Page posts into listings, post listings to your Page, and let the AI answer Messenger inquiries until someone on your team takes over. MyHomeSeller only posts when someone presses Post.", "Gawing listing ang posts ng Page mo, mag-post ng listings sa Page mo, at hayaan ang AI na sumagot sa Messenger inquiries hangga't walang nagte-take over sa team mo. Magpo-post lang ang MyHomeSeller kapag may pumindot ng Post.")}
              </p>
              {pages.length ? (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {pages.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{p.name}</p>
                        <p className="text-xs text-muted">
                          {canPublish(p.tasks)
                            ? "Can read and post"
                            : say("Read only: you need to be an admin or editor of this Page to post", "Read only: kailangan admin o editor ka ng Page na ito para makapag-post")}
                          {p.messenger_enabled ? ", AI replies on Messenger" : ""}, connected {timeAgo(p.connected_at)}
                        </p>
                      </div>
                      {manageFacebook ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <form action={setMessenger.bind(null, p.id, !p.messenger_enabled)}>
                            <SubmitButton
                              variant={p.messenger_enabled ? "secondary" : "primary"}
                              pendingText={p.messenger_enabled ? "Turning off…" : "Turning on…"}
                            >
                              {p.messenger_enabled ? "Turn off AI replies" : "Turn on AI replies"}
                            </SubmitButton>
                          </form>
                          <form action={disconnectFacebookPage.bind(null, p.id)}>
                            <SubmitButton variant="ghost" pendingText="Disconnecting…">
                              Disconnect
                            </SubmitButton>
                          </form>
                        </div>
                      ) : p.messenger_enabled ? (
                        <Badge tone="brand">AI replies on</Badge>
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
                <p className="text-muted">{say("The owner or an admin can connect the business's Pages.", "Owner o admin ang pwedeng mag-connect ng Pages ng business.")}</p>
              )}
            </div>
          )}
        </Panel>

        <Panel icon={Mail} title="Email alerts" status={email ? <Badge tone="brand">On</Badge> : <Badge>Not set up</Badge>}>
          <p>
            {email
              ? say("The owner, admins and agents get an email the moment a buyer requests a viewing, with the buyer's mobile number and a link to the lead.", "Makakatanggap ng email ang owner, admins at agents sa oras na mag-request ng viewing ang buyer, kasama ang mobile number ng buyer at link sa lead.")
              : say("Lead emails start once an email sender is added to MyHomeSeller's settings. Requests still arrive in Viewing requests.", "Magsisimula ang lead emails kapag may email sender na sa settings ng MyHomeSeller. Papasok pa rin ang requests sa Viewing requests.")}
          </p>
        </Panel>

        <Panel
          icon={GoogleIcon}
          title="Google account"
          status={conn ? <Badge tone="brand">Connected</Badge> : <Badge>Not connected</Badge>}
        >
          {!googleReady ? (
            <p>
              {say("Connect Google isn't switched on yet.", "Hindi pa naka-on ang Connect Google.")}{" "}
              {manage ? <span className="text-muted">{say("Missing server settings:", "Kulang na server settings:")} {missing.join(", ")}.</span> : null}
            </p>
          ) : conn ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>
                {say("Connected as", "Naka-connect bilang")} <span className="font-medium text-ink">{conn.google_email}</span>.{" "}
                {say("MyHomeSeller can only see files and calendars it created.", "Ang nakikita lang ng MyHomeSeller ay ang files at calendars na ginawa nito.")}
              </p>
              <form action={disconnectGoogle}>
                <SubmitButton variant="secondary" pendingText="Disconnecting…">
                  Disconnect
                </SubmitButton>
              </form>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>{say("Link your Google account to sync leads to Sheets and viewings to Calendar.", "I-link ang Google account mo para ma-sync ang leads sa Sheets at ang viewings sa Calendar.")}</p>
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
                {say("Every lead is kept in one sheet for the whole team", "Nasa iisang sheet ang bawat lead para sa buong team")}
                {integ?.sheets_synced_at ? say(`, last updated ${timeAgo(integ.sheets_synced_at)}`, `, huling na-update ${timeAgo(integ.sheets_synced_at)}`) : ""}.
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
              <p>{say("Create a sheet in your Google Drive that updates itself with every new lead and status change.", "Gumawa ng sheet sa Google Drive mo na kusang nag-a-update sa bawat bagong lead at pagbabago ng status.")}</p>
              {conn?.scopes.includes(SHEETS_SCOPE) ? (
                <form action={createLeadsSheet}>
                  <SubmitButton pendingText="Creating…">Create leads sheet</SubmitButton>
                </form>
              ) : (
                <span className="text-sm text-muted">Connect Google first.</span>
              )}
            </div>
          ) : (
            <p>{say("The owner or an admin can turn this on. You can still use Export CSV in Viewing requests.", "Owner o admin ang pwedeng mag-on nito. Pwede mo pa ring gamitin ang Export CSV sa Viewing requests.")}</p>
          )}
        </Panel>

        <Panel
          icon={CalendarDays}
          title="Google Calendar: viewings"
          status={conn?.scopes.includes(CALENDAR_SCOPE) ? <Badge tone="brand">On for you</Badge> : <Badge>Off</Badge>}
        >
          <p>
            {conn?.scopes.includes(CALENDAR_SCOPE)
              ? say("When you set a viewing time on a lead, it's added to a “MyHomeSeller viewings” calendar in your Google Calendar, with a reminder an hour before. Changes and cancellations update it too.", "Kapag nag-set ka ng viewing time sa isang lead, madadagdag ito sa “MyHomeSeller viewings” calendar sa Google Calendar mo, na may reminder isang oras bago. Naa-update din ito kapag may nabago o na-cancel.")
              : say("Connect Google to add viewings to your calendar automatically. Until then, use “Add to Google Calendar” on any lead.", "I-connect ang Google para kusang madagdag ang viewings sa calendar mo. Habang wala pa, gamitin ang “Add to Google Calendar” sa kahit anong lead.")}
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
    <span aria-hidden className={cx("grid place-items-center rounded-full border border-current text-xs font-bold", className)}>
      G
    </span>
  );
}
