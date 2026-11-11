import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "./crypto";
import { sendEmail } from "./email";
import {
  CALENDAR_SCOPE,
  createViewingsCalendar,
  deleteEvent,
  googleConfig,
  insertEvent,
  packEventRef,
  patchEvent,
  refreshAccessToken,
  unpackEventRef,
  writeSheet,
} from "./google";
import { SHEET_HEADER, leadRow, newLeadEmail, type Lead } from "./leads";
import { createAdminClient } from "./supabase/admin";

/**
 * Work that runs after a response (via next/server `after`): never throws, logs
 * failures without personal data. Every query is scoped to one business.
 */

const LEAD_COLUMNS =
  "id, business_id, property_id, buyer_name, buyer_phone, preferred_date, budget_note, message, status, agent_note, scheduled_at, calendar_event_id, created_at";

type LeadRecord = Lead & { business_id: string; property_id: string; calendar_event_id: string | null };

function log(job: string, e: unknown) {
  console.error(`[lead-jobs] ${job} failed:`, e instanceof Error ? e.message : String(e));
}

async function accessTokenFor(admin: SupabaseClient, userId: string) {
  const cfg = googleConfig();
  if (!cfg) return null;
  const { data } = await admin.from("google_connections").select("refresh_token_enc, scopes, calendar_id").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  const tokens = await refreshAccessToken(fetch, cfg, decryptSecret(data.refresh_token_enc as string));
  return { token: tokens.access_token, scopes: (data.scopes ?? []) as string[], calendarId: (data.calendar_id ?? null) as string | null };
}

/** Email the business's owner, admins and agents about a new viewing request. */
export async function notifyNewLead(requestId: string, appOrigin: string) {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: lead } = await admin.from("viewing_requests").select(LEAD_COLUMNS).eq("id", requestId).maybeSingle();
    if (!lead) return;
    const l = lead as LeadRecord;
    const [{ data: property }, { data: business }, { data: members }] = await Promise.all([
      admin.from("properties").select("name, location").eq("id", l.property_id).eq("business_id", l.business_id).single(),
      admin.from("businesses").select("name").eq("id", l.business_id).single(),
      admin
        .from("business_members")
        .select("user_id")
        .eq("business_id", l.business_id)
        .eq("status", "active")
        .in("role", ["owner", "admin", "agent"]),
    ]);
    if (!property || !business || !members?.length) return;
    const { data: profiles } = await admin.from("profiles").select("email").in(
      "id",
      members.map((m) => m.user_id),
    );
    const to = (profiles ?? []).map((p) => p.email as string | null).filter((e): e is string => Boolean(e));
    const mail = newLeadEmail(l, property, business.name as string, `${appOrigin}/app/leads`);
    const res = await sendEmail({ to, ...mail });
    if (!res.sent && res.reason !== "email not configured") log("notifyNewLead", res.reason);
  } catch (e) {
    log("notifyNewLead", e);
  }
}

/** Rewrite the business's leads spreadsheet, if one is connected. */
export async function syncLeadsSheet(businessId: string) {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: integ } = await admin
      .from("business_integrations")
      .select("sheets_user_id, spreadsheet_id")
      .eq("business_id", businessId)
      .maybeSingle();
    if (!integ?.sheets_user_id || !integ.spreadsheet_id) return;
    const g = await accessTokenFor(admin, integ.sheets_user_id as string);
    if (!g) return;

    const { data: leads } = await admin
      .from("viewing_requests")
      .select(LEAD_COLUMNS)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(2000);
    const propIds = [...new Set((leads ?? []).map((l) => l.property_id as string))];
    const { data: props } = propIds.length
      ? await admin.from("properties").select("id, name").eq("business_id", businessId).in("id", propIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const names = new Map((props ?? []).map((p) => [p.id as string, p.name as string]));
    const rows = [[...SHEET_HEADER], ...(leads ?? []).map((l) => leadRow(l as LeadRecord, names.get(l.property_id as string) ?? ""))];

    await writeSheet(fetch, g.token, integ.spreadsheet_id as string, rows);
    await admin.from("business_integrations").update({ sheets_synced_at: new Date().toISOString() }).eq("business_id", businessId);
  } catch (e) {
    log("syncLeadsSheet", e);
  }
}

/**
 * Keep a lead's Google Calendar event in step with its viewing time, in the
 * calendar of the person who scheduled it. Removed when the time is cleared or
 * the lead is closed.
 */
export async function syncViewingEvent(requestId: string, actorUserId: string) {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: lead } = await admin.from("viewing_requests").select(LEAD_COLUMNS).eq("id", requestId).maybeSingle();
    if (!lead) return;
    const l = lead as LeadRecord;
    const existing = unpackEventRef(l.calendar_event_id);
    const wantEvent = Boolean(l.scheduled_at) && l.status !== "closed";

    if (!wantEvent) {
      if (existing) {
        const g = await accessTokenFor(admin, existing.userId);
        if (g) await deleteEvent(fetch, g.token, existing.calendarId, existing.eventId);
        await admin.from("viewing_requests").update({ calendar_event_id: null }).eq("id", requestId);
      }
      return;
    }

    const { data: property } = await admin
      .from("properties")
      .select("name, location")
      .eq("id", l.property_id)
      .eq("business_id", l.business_id)
      .single();
    if (!property) return;
    const event = {
      summary: `Viewing: ${property.name} with ${l.buyer_name}`,
      location: property.location as string,
      description: [`Buyer: ${l.buyer_name}`, `Mobile: ${l.buyer_phone}`, l.budget_note ? `Budget: ${l.budget_note}` : "", l.message ? `Message: ${l.message}` : ""]
        .filter(Boolean)
        .join("\n"),
      startIso: l.scheduled_at!,
    };

    if (existing) {
      const g = await accessTokenFor(admin, existing.userId);
      if (g) await patchEvent(fetch, g.token, existing.calendarId, existing.eventId, event);
      return;
    }

    const g = await accessTokenFor(admin, actorUserId);
    if (!g || !g.scopes.includes(CALENDAR_SCOPE)) return;
    let calendarId = g.calendarId;
    if (!calendarId) {
      calendarId = await createViewingsCalendar(fetch, g.token);
      await admin.from("google_connections").update({ calendar_id: calendarId }).eq("user_id", actorUserId);
    }
    const eventId = await insertEvent(fetch, g.token, calendarId, event);
    await admin
      .from("viewing_requests")
      .update({ calendar_event_id: packEventRef(actorUserId, calendarId, eventId) })
      .eq("id", requestId)
      .eq("business_id", l.business_id);
  } catch (e) {
    log("syncViewingEvent", e);
  }
}
