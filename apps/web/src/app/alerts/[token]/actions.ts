"use server";

import { redirect } from "next/navigation";
import { confirmAlert, deleteAlert } from "@/lib/match-alerts";
import { createAdminClient } from "@/lib/supabase/admin";

/** The link's key is the permission here: only the person with the email has it. */
export async function confirmMatchEmails(token: string): Promise<void> {
  const admin = createAdminClient();
  if (admin) await confirmAlert(admin, token);
  redirect(`/alerts/${encodeURIComponent(token)}`);
}

export async function stopMatchEmails(token: string): Promise<void> {
  const admin = createAdminClient();
  const done = admin ? await deleteAlert(admin, token) : false;
  redirect(`/alerts/${encodeURIComponent(token)}${done ? "?deleted=1" : ""}`);
}
