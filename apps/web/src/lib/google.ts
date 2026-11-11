/**
 * Google APIs over plain fetch (no SDK): OAuth, Sheets (drive.file: only files
 * this app created) and Calendar (calendar.app.created: only the "ProPilot
 * viewings" calendar this app creates). Every call takes a fetch so tests can
 * stub it.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.app.created",
] as const;

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

type Fetch = typeof fetch;

export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(f: Fetch, url: string, init: RequestInit): Promise<T> {
  const res = await f(url, init);
  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json()).slice(0, 300);
    } catch {
      /* no body */
    }
    throw new GoogleError(`Google ${res.status} ${detail}`, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function authUrl(clientId: string, redirectUri: string, state: string, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) p.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export type TokenSet = { access_token: string; refresh_token?: string; scope?: string; expires_in: number };

export function exchangeCode(f: Fetch, cfg: { clientId: string; clientSecret: string }, code: string, redirectUri: string) {
  return call<TokenSet>(f, "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
}

export function refreshAccessToken(f: Fetch, cfg: { clientId: string; clientSecret: string }, refreshToken: string) {
  return call<TokenSet>(f, "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token",
    }),
  });
}

export async function revokeToken(f: Fetch, token: string) {
  await f(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}

export function userEmail(f: Fetch, accessToken: string) {
  return call<{ email: string }>(f, "https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

// ---------------------------------------------------------------- Sheets

export async function createSpreadsheet(f: Fetch, token: string, title: string) {
  return call<{ spreadsheetId: string; spreadsheetUrl: string }>(f, "https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: "Leads", gridProperties: { frozenRowCount: 1 } } }],
    }),
  });
}

/** Replace the Leads tab with these rows (header first). RAW input: nothing is read as a formula. */
export async function writeSheet(f: Fetch, token: string, spreadsheetId: string, rows: string[][]) {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values`;
  await call(f, `${base}/${encodeURIComponent("Leads!A:Z")}:clear`, { method: "POST", headers: auth(token), body: "{}" });
  await call(f, `${base}/${encodeURIComponent("Leads!A1")}?valueInputOption=RAW`, {
    method: "PUT",
    headers: auth(token),
    body: JSON.stringify({ values: rows }),
  });
}

// ---------------------------------------------------------------- Calendar

export async function createViewingsCalendar(f: Fetch, token: string) {
  const cal = await call<{ id: string }>(f, "https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ summary: "ProPilot viewings", timeZone: "Asia/Manila" }),
  });
  return cal.id;
}

export type ViewingEvent = { summary: string; location: string; description: string; startIso: string; minutes?: number };

function eventBody(e: ViewingEvent) {
  const end = new Date(new Date(e.startIso).getTime() + (e.minutes ?? 60) * 60_000).toISOString();
  return {
    summary: e.summary,
    location: e.location,
    description: e.description,
    start: { dateTime: e.startIso, timeZone: "Asia/Manila" },
    end: { dateTime: end, timeZone: "Asia/Manila" },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }] },
  };
}

const eventsUrl = (calendarId: string) => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

export async function insertEvent(f: Fetch, token: string, calendarId: string, e: ViewingEvent) {
  const ev = await call<{ id: string }>(f, eventsUrl(calendarId), { method: "POST", headers: auth(token), body: JSON.stringify(eventBody(e)) });
  return ev.id;
}

export async function patchEvent(f: Fetch, token: string, calendarId: string, eventId: string, e: ViewingEvent) {
  await call(f, `${eventsUrl(calendarId)}/${encodeURIComponent(eventId)}`, { method: "PATCH", headers: auth(token), body: JSON.stringify(eventBody(e)) });
}

export async function deleteEvent(f: Fetch, token: string, calendarId: string, eventId: string) {
  try {
    await call(f, `${eventsUrl(calendarId)}/${encodeURIComponent(eventId)}`, { method: "DELETE", headers: auth(token) });
  } catch (e) {
    if (!(e instanceof GoogleError && (e.status === 404 || e.status === 410))) throw e;
  }
}

/** calendar_event_id is stored as "<userId>|<calendarId>|<eventId>" so we know whose calendar holds it. */
export function packEventRef(userId: string, calendarId: string, eventId: string) {
  return [userId, calendarId, eventId].join("|");
}
export function unpackEventRef(ref: string | null | undefined) {
  const parts = (ref ?? "").split("|");
  return parts.length === 3 && parts.every(Boolean) ? { userId: parts[0]!, calendarId: parts[1]!, eventId: parts[2]! } : null;
}
