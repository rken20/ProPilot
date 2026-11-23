import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailProvider, esc, sendEmail } from "./email";
import { CONSENT_TEXT, EMAIL_EVERY_DAYS, WANT_TYPES, pickMatches, type Alert, type AlertListing, type Wants } from "./match-alert-rules";
import { formatPeso } from "./money";
import { TYPE_LABEL } from "./property-labels";
import { publicListingPath } from "./public-listing";
import { FINANCING, type Financing } from "./qualification";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Match emails need working email, and a key to sign the links in them. */
export function matchAlertsOn(): boolean {
  return emailProvider() !== null && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function sign(id: string): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update(`match-alert:${id}`).digest("base64url").slice(0, 32);
}

/** The key in a buyer's link. Only someone with the email can know it, so it stands in for signing in. */
export function alertToken(id: string): string {
  return `${id}.${sign(id)}`;
}

/** The alert id behind a link, or null when the link is wrong. */
export function alertIdFrom(token: string): string | null {
  const [id, sig, ...rest] = token.split(".");
  if (!id || !sig || rest.length || !UUID.test(id) || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const want = Buffer.from(sign(id));
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want) ? id : null;
}

const shell = (title: string, body: string) => `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1c1a17;line-height:1.5">
<h1 style="font-size:18px">${esc(title)}</h1>
${body}
</body></html>`;
const button = (url: string, label: string) =>
  `<p><a href="${esc(url)}" style="display:inline-block;background:#124fbf;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${esc(label)}</a></p>`;

/**
 * Save what a buyer is looking for, unconfirmed, and email them a link to
 * confirm. Nothing is matched or sent until they do. Returns whether the
 * confirmation email went out.
 */
export async function saveAlert(
  admin: SupabaseClient,
  origin: string,
  input: { email: string; name: string; wants: Wants; businessId: string; propertyId: string },
): Promise<boolean> {
  if (!matchAlertsOn() || !input.wants.consent) return false;
  // Don't let anyone flood an address with confirmation emails.
  const { count } = await admin
    .from("match_alerts")
    .select("id", { count: "exact", head: true })
    .eq("email", input.email)
    .is("confirmed_at", null)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= 2) return false;

  const { data: row, error } = await admin
    .from("match_alerts")
    .insert({
      email: input.email,
      name: input.name.slice(0, 120),
      budget_max_minor: input.wants.budgetMaxMinor,
      areas: input.wants.areas,
      property_types: input.wants.types,
      financing: input.wants.financing,
      source_business_id: input.businessId,
      source_property_id: input.propertyId,
      consent_text: CONSENT_TEXT,
    })
    .select("id")
    .single();
  if (error || !row) return false;

  const url = `${origin}/alerts/${alertToken(row.id as string)}`;
  const subject = "Confirm your property match emails";
  const lines = [
    `Hi ${input.name}, you asked MyHomeSeller to email you properties that fit what you're looking for.`,
    "Please confirm it was you. We won't send anything until you do.",
    "If this wasn't you, ignore this email and nothing will be saved.",
  ];
  const res = await sendEmail({
    to: [input.email],
    subject,
    text: [...lines, "", `Confirm: ${url}`].join("\n"),
    html: shell(subject, `${lines.map((l) => `<p>${esc(l)}</p>`).join("")}${button(url, "Confirm match emails")}`),
  });
  if (!res.sent) await admin.from("match_alerts").delete().eq("id", row.id);
  return res.sent;
}

export type SavedAlert = { id: string; email: string; confirmed: boolean; summary: string[] };

const summaryOf = (r: { property_types: string[]; budget_max_minor: number | string | null; areas: string[]; financing: string | null }): string[] =>
  [
    r.property_types.length ? `Type: ${r.property_types.map((t) => WANT_TYPES[t as keyof typeof WANT_TYPES] ?? TYPE_LABEL[t as keyof typeof TYPE_LABEL] ?? t).join(" or ")}` : null,
    r.budget_max_minor !== null ? `Budget: up to ${formatPeso(Number(r.budget_max_minor))}` : null,
    r.areas.length ? `Area: ${r.areas.join(", ")}` : null,
    r.financing ? `Paying by: ${FINANCING[r.financing as Financing] ?? r.financing}` : null,
  ].filter((l): l is string => Boolean(l));

/** What's saved behind a buyer's link, or null if the link is wrong or the alert is gone. */
export async function alertFor(admin: SupabaseClient, token: string): Promise<SavedAlert | null> {
  const id = alertIdFrom(token);
  if (!id) return null;
  const { data } = await admin.from("match_alerts").select("id, email, confirmed_at, property_types, budget_max_minor, areas, financing").eq("id", id).maybeSingle();
  if (!data) return null;
  return { id: data.id as string, email: data.email as string, confirmed: data.confirmed_at !== null, summary: summaryOf(data as Parameters<typeof summaryOf>[0]) };
}

/** The buyer confirmed from their email. Their older alerts are replaced by this one. */
export async function confirmAlert(admin: SupabaseClient, token: string): Promise<boolean> {
  const id = alertIdFrom(token);
  if (!id) return false;
  const { data } = await admin.from("match_alerts").update({ confirmed_at: new Date().toISOString() }).eq("id", id).is("confirmed_at", null).select("email").maybeSingle();
  if (data?.email) await admin.from("match_alerts").delete().eq("email", data.email).neq("id", id);
  return true;
}

/** Stop the emails and delete everything saved for this buyer's email address. */
export async function deleteAlert(admin: SupabaseClient, token: string): Promise<boolean> {
  const id = alertIdFrom(token);
  if (!id) return false;
  const { data } = await admin.from("match_alerts").select("email").eq("id", id).maybeSingle();
  if (data?.email) await admin.from("match_alerts").delete().eq("email", data.email);
  return true;
}

/**
 * The daily job. Clears alerts nobody confirmed and ones past their year, then
 * emails each confirmed buyer the listings that fit and weren't sent before:
 * at most once a week, paid sellers' listings first.
 */
export async function sendMatchEmails(admin: SupabaseClient, origin: string, now = new Date(), deadline = Date.now() + 10_000): Promise<{ emails: number; listings: number }> {
  const out = { emails: 0, listings: 0 };
  if (!matchAlertsOn()) return out;
  await admin.from("match_alerts").delete().is("confirmed_at", null).lt("created_at", new Date(now.getTime() - 7 * 86_400_000).toISOString());
  await admin.from("match_alerts").delete().lt("expires_at", now.toISOString());

  const dueBefore = new Date(now.getTime() - EMAIL_EVERY_DAYS * 86_400_000).toISOString();
  const [{ data: alerts }, { data: listings }, { data: subs }] = await Promise.all([
    admin
      .from("match_alerts")
      .select("id, email, name, budget_max_minor, areas, property_types, financing, source_business_id, source_property_id")
      .not("confirmed_at", "is", null)
      .or(`last_emailed_at.is.null,last_emailed_at.lt.${dueBefore}`)
      .order("last_emailed_at", { ascending: true, nullsFirst: true })
      .limit(300),
    admin
      .from("properties")
      .select("id, business_id, name, type, location, price_minor, financing")
      .eq("is_public", true)
      .eq("status", "available")
      .order("updated_at", { ascending: false })
      .limit(3000),
    admin.from("subscriptions").select("business_id, plans(code)").gt("current_period_end", now.toISOString()).limit(5000),
  ]);
  if (!alerts?.length || !listings?.length) return out;
  const plan = new Map((subs ?? []).map((s) => [s.business_id as string, (s.plans as unknown as { code: string } | null)?.code]));
  const all: AlertListing[] = listings.map((l) => ({ ...(l as unknown as AlertListing), price_minor: Number(l.price_minor) }));

  for (const a of alerts) {
    if (Date.now() > deadline) break;
    try {
      const { data: sent } = await admin.from("match_alert_sends").select("property_id").eq("alert_id", a.id);
      const alert: Alert = {
        id: a.id as string,
        budgetMaxMinor: a.budget_max_minor === null ? null : Number(a.budget_max_minor),
        areas: (a.areas as string[]) ?? [],
        types: (a.property_types as string[]) ?? [],
        financing: (a.financing as string | null) ?? null,
        sourceBusinessId: (a.source_business_id as string | null) ?? null,
        sourcePropertyId: (a.source_property_id as string | null) ?? null,
      };
      const picks = pickMatches(alert, all, new Set((sent ?? []).map((s) => s.property_id as string)), (b) => plan.get(b));
      if (!picks.length) continue;

      const manage = `${origin}/alerts/${alertToken(alert.id)}`;
      const subject = picks.length === 1 ? "A property that fits what you're looking for" : `${picks.length} properties that fit what you're looking for`;
      const rows = picks.map((l) => ({ title: l.name, detail: `${TYPE_LABEL[l.type as keyof typeof TYPE_LABEL] ?? l.type} · ${l.location} · ${formatPeso(l.price_minor)}`, url: `${origin}${publicListingPath(l.id)}` }));
      const why = "You get this because you asked MyHomeSeller to email you matching properties. The sellers don't have your details unless you send them an inquiry.";
      const res = await sendEmail({
        to: [a.email as string],
        subject,
        text: [`Hi ${a.name ?? "there"},`, "", ...rows.flatMap((r) => [r.title, r.detail, r.url, ""]), why, `Stop these emails and delete your preferences: ${manage}`].join("\n"),
        html: shell(
          subject,
          `<p>Hi ${esc((a.name as string | null) ?? "there")},</p>${rows
            .map((r) => `<p style="margin:14px 0"><a href="${esc(r.url)}" style="color:#124fbf;font-weight:bold">${esc(r.title)}</a><br><span style="color:#6b665d">${esc(r.detail)}</span></p>`)
            .join("")}<p style="color:#6b665d;font-size:13px">${esc(why)} <a href="${esc(manage)}" style="color:#6b665d">Stop these emails and delete my preferences</a></p>`,
        ),
      });
      if (!res.sent) continue;
      await admin.from("match_alert_sends").insert(picks.map((l) => ({ alert_id: alert.id, property_id: l.id })));
      await admin.from("match_alerts").update({ last_emailed_at: now.toISOString() }).eq("id", alert.id);
      out.emails++;
      out.listings += picks.length;
    } catch (e) {
      console.error("[match-alerts] send:", e instanceof Error ? e.message : String(e));
    }
  }
  return out;
}
