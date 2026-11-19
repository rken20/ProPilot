import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { esc, sendEmail } from "@/lib/email";

/** Short billing notices. Sending is best-effort: a failed email never blocks a payment. */
async function send(to: string[], subject: string, lines: Array<[string, string]>, link: { label: string; url: string }) {
  if (!to.length) return;
  const clean = subject.replace(/[\r\n]+/g, " ").slice(0, 200);
  const text = [...lines.map(([k, v]) => `${k}: ${v}`), "", `${link.label}: ${link.url}`].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1c1a17">
<h1 style="font-size:18px">${esc(clean)}</h1>
<table>${lines.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5c574f">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
<p><a href="${esc(link.url)}" style="display:inline-block;background:#24543f;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${esc(link.label)}</a></p>
</body></html>`;
  try {
    await sendEmail({ to, subject: clean, text, html });
  } catch (e) {
    console.error("[billing] email failed:", e instanceof Error ? e.message : String(e));
  }
}

export async function emailSuperAdmins(admin: SupabaseClient, subject: string, lines: Array<[string, string]>, link: { label: string; url: string }) {
  const { data } = await admin.from("profiles").select("email").eq("is_superadmin", true);
  await send((data ?? []).map((p) => p.email as string | null).filter((e): e is string => !!e), subject, lines, link);
}

export async function emailOwners(admin: SupabaseClient, businessId: string, subject: string, lines: Array<[string, string]>, link: { label: string; url: string }) {
  const { data: owners } = await admin.from("business_members").select("user_id").eq("business_id", businessId).eq("status", "active").eq("role", "owner");
  if (!owners?.length) return;
  const { data } = await admin.from("profiles").select("email").in("id", owners.map((o) => o.user_id));
  await send((data ?? []).map((p) => p.email as string | null).filter((e): e is string => !!e), subject, lines, link);
}

export async function emailUser(admin: SupabaseClient, userId: string, subject: string, lines: Array<[string, string]>, link: { label: string; url: string }) {
  const { data } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  await send(data?.email ? [data.email as string] : [], subject, lines, link);
}
