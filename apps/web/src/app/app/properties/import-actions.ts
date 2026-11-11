"use server";

import Anthropic from "@anthropic-ai/sdk";
import { can } from "@propilot/shared";
import { requireBusiness } from "@/lib/auth";
import { str } from "@/lib/form";
import { DEFAULT_MODEL } from "@/lib/listing-assistant";
import { fillFromPost, KEY_FIELDS, MAX_POST_CHARS } from "@/lib/post-import";
import { createClient } from "@/lib/supabase/server";

export type ImportState = {
  values?: Record<string, string>;
  missing?: string[];
  error?: string;
  /** Changes on every fill so the form below re-mounts with the new values. */
  nonce?: number;
};

/** Read an agent's own post and return Add property form values. Saves nothing. */
export async function importFromPost(prev: ImportState, form: FormData): Promise<ImportState> {
  // On an error, keep the last fill so the form and the open paste box don't reset.
  const fail = (error: string): ImportState => ({ values: prev.values, missing: prev.missing, nonce: prev.nonce, error });
  const biz = await requireBusiness();
  if (!can(biz.role, "property.create")) return fail("Your role can't add properties.");

  const post = str(form, "post");
  if (post.length < 20) return fail("Paste the full text of your post first.");
  if (post.length > MAX_POST_CHARS) return fail(`That's over ${MAX_POST_CHARS.toLocaleString()} characters. Paste one listing at a time.`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fail("Filling from a post isn't switched on yet.");

  const supabase = await createClient();
  const [hour, day] = await Promise.all([
    supabase.rpc("consume_rate_limit", { p_bucket: "post_import_hour", p_limit: 20, p_window_seconds: 3600 }),
    supabase.rpc("consume_rate_limit", { p_bucket: "post_import_day", p_limit: 60, p_window_seconds: 86400 }),
  ]);
  if (hour.error || day.error || hour.data !== true || day.data !== true) {
    return fail("You've filled a lot of listings from posts today. Please try again later.");
  }

  let values: Record<string, string>;
  try {
    values = await fillFromPost(new Anthropic({ apiKey }), process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, post);
  } catch (e) {
    console.error("post import failed", e instanceof Error ? e.message : e);
    return fail("Couldn't read the post just now. Please try again in a minute.");
  }
  if (!values.name && !values.price && !values.location) {
    return fail("Couldn't find listing details in that text. Check you pasted the whole post.");
  }
  return {
    values,
    missing: KEY_FIELDS.filter(([k]) => !values[k]).map(([, label]) => label),
    nonce: Date.now(),
  };
}
