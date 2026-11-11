/**
 * Pure helpers for viewing-request leads: the agent email, the Google Calendar
 * link, the spreadsheet/CSV rows, and Manila-time handling. No I/O here.
 */
import { esc } from "./email-escape";

export type Lead = {
  id: string;
  buyer_name: string;
  buyer_phone: string;
  preferred_date: string | null;
  budget_note: string | null;
  message: string | null;
  status: string;
  agent_note?: string | null;
  scheduled_at?: string | null;
  created_at: string;
};

export const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  scheduled: "Viewing scheduled",
  completed: "Viewed",
  closed: "Closed",
};

const TZ = "Asia/Manila";

export function manilaDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function prettyDate(ymd: string): string {
  return new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${ymd}T00:00:00Z`),
  );
}

/** "2026-11-20T10:00" typed in a datetime-local field, read as Manila time (UTC+8, no DST). */
export function manilaInputToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The reverse, for prefilling a datetime-local field. */
export function isoToManilaInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000);
  return d.toISOString().slice(0, 16);
}

const compact = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * A Google Calendar "create event" link. Uses the agent's viewing time when set
 * (one hour), else the buyer's preferred date as an all-day event, else no date.
 */
export function googleCalendarUrl(lead: Lead, property: { name: string; location: string }): string {
  const p = new URLSearchParams({ action: "TEMPLATE", text: `Viewing: ${property.name} with ${lead.buyer_name}` });
  if (lead.scheduled_at) {
    const start = new Date(lead.scheduled_at);
    const end = new Date(start.getTime() + 60 * 60_000);
    p.set("dates", `${compact(start.toISOString())}/${compact(end.toISOString())}`);
  } else if (lead.preferred_date) {
    const day = lead.preferred_date.replace(/-/g, "");
    const next = new Date(`${lead.preferred_date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    p.set("dates", `${day}/${next.toISOString().slice(0, 10).replace(/-/g, "")}`);
  }
  p.set("ctz", TZ);
  p.set("location", property.location);
  p.set(
    "details",
    [
      `Buyer: ${lead.buyer_name}`,
      `Mobile: ${lead.buyer_phone}`,
      lead.budget_note ? `Budget: ${lead.budget_note}` : "",
      lead.message ? `Message: ${lead.message}` : "",
      "From ProPilot AI",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export const SHEET_HEADER = [
  "Requested",
  "Buyer",
  "Mobile",
  "Property",
  "Preferred date",
  "Viewing time",
  "Status",
  "Budget",
  "Message",
  "Agent note",
] as const;

export function leadRow(lead: Lead, propertyName: string): string[] {
  return [
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(
      new Date(lead.created_at),
    ),
    lead.buyer_name,
    lead.buyer_phone,
    propertyName,
    lead.preferred_date ?? "",
    lead.scheduled_at ? manilaDateTime(lead.scheduled_at) : "",
    STATUS_LABEL[lead.status] ?? lead.status,
    lead.budget_note ?? "",
    lead.message ?? "",
    lead.agent_note ?? "",
  ];
}

/**
 * CSV for Excel and Google Sheets: quoted fields, CRLF, a BOM so ₱ and accents
 * survive, and cells that start like a formula prefixed with ' so a buyer's
 * message can never run as a formula when the file is opened.
 */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  const cell = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(safe) || safe !== safe.trim() ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** The email an agent gets when a buyer requests a viewing. */
export function newLeadEmail(lead: Lead, property: { name: string; location: string }, businessName: string, leadsUrl: string) {
  const lines: Array<[string, string]> = [
    ["Buyer", lead.buyer_name],
    ["Mobile", lead.buyer_phone],
    ["Property", `${property.name}, ${property.location}`],
    ["Preferred date", lead.preferred_date ? prettyDate(lead.preferred_date) : "Not given"],
    ...(lead.budget_note ? ([["Budget", lead.budget_note]] as Array<[string, string]>) : []),
    ...(lead.message ? ([["Message", lead.message]] as Array<[string, string]>) : []),
  ];
  const subject = `New viewing request: ${property.name}`;
  const text = [
    `${lead.buyer_name} wants to view ${property.name}.`,
    "",
    ...lines.map(([k, v]) => `${k}: ${v}`),
    "",
    `Call or text them to confirm, then update the lead: ${leadsUrl}`,
    "",
    `Sent by ProPilot AI to the team at ${businessName}.`,
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#0e1726">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e8f0;border-radius:12px">
<tr><td style="padding:24px 24px 8px"><p style="margin:0;font-size:13px;color:#5b6577">ProPilot AI</p>
<h1 style="margin:8px 0 0;font-size:20px;line-height:1.3">${esc(lead.buyer_name)} wants to view ${esc(property.name)}</h1></td></tr>
<tr><td style="padding:16px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${lines.map(([k, v]) => `<tr><td style="padding:6px 0;width:130px;font-size:13px;color:#5b6577;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-size:14px">${esc(v)}</td></tr>`).join("")}
</table></td></tr>
<tr><td style="padding:8px 24px 24px"><a href="${esc(leadsUrl)}" style="display:inline-block;background:#1f5bd8;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 16px;border-radius:8px">Open buyer leads</a>
<p style="margin:16px 0 0;font-size:12px;color:#5b6577">Sent to the team at ${esc(businessName)}.</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
