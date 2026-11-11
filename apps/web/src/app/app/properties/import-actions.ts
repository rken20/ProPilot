"use server";

import Anthropic from "@anthropic-ai/sdk";
import { can } from "@propilot/shared";
import { requireBusiness } from "@/lib/auth";
import { str } from "@/lib/form";
import { DEFAULT_MODEL } from "@/lib/listing-assistant";
import { pageWithToken, RECONNECT_MESSAGE } from "@/lib/facebook-pages";
import { GraphError, metaConfig, pagePost, postImageUrls, recentPosts } from "@/lib/meta";
import { fillFromPost, KEY_FIELDS, MAX_POST_CHARS } from "@/lib/post-import";
import { createClient } from "@/lib/supabase/server";

export type ImportState = {
  values?: Record<string, string>;
  missing?: string[];
  error?: string;
  /** Changes on every fill so the form below re-mounts with the new values. */
  nonce?: number;
  /** "<page row id>:<post id>" when the fill came from a connected Page; its photos are copied on save. */
  importRef?: string;
  photoCount?: number;
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

export type PostSummary = { id: string; text: string; createdAt: string; image: string | null; photoCount: number; link?: string };

/** Recent posts on one of the business's connected Pages. */
export async function listPagePosts(pageRowId: string): Promise<{ posts?: PostSummary[]; error?: string }> {
  const biz = await requireBusiness();
  if (!can(biz.role, "property.create")) return { error: "Your role can't add properties." };
  const cfg = metaConfig();
  const page = await pageWithToken(biz.businessId, pageRowId);
  if (!cfg || !page) return { error: "That Page isn't connected." };
  try {
    const posts = await recentPosts(fetch, cfg, page.pageId, page.token);
    return {
      posts: posts
        .filter((p) => p.message?.trim())
        .map((p) => {
          const images = postImageUrls(p);
          return {
            id: p.id,
            text: p.message!.trim().slice(0, 400),
            createdAt: p.created_time,
            image: images[0] ?? null,
            photoCount: images.length,
            link: p.permalink_url?.startsWith("https://") ? p.permalink_url : undefined,
          };
        }),
    };
  } catch (e) {
    if (e instanceof GraphError && e.tokenInvalid) return { error: RECONNECT_MESSAGE };
    console.error("[meta] list posts failed:", e instanceof Error ? e.message : e);
    return { error: "Couldn't load posts from Facebook. Please try again." };
  }
}

/** Fill the form from one of the business's own Page posts. Its photos are copied when the listing is saved. */
export async function importPagePost(prev: ImportState, form: FormData): Promise<ImportState> {
  const fail = (error: string): ImportState => ({ ...prev, error });
  const biz = await requireBusiness();
  if (!can(biz.role, "property.create")) return fail("Your role can't add properties.");
  const pageRowId = str(form, "page");
  const postId = str(form, "postId");
  const cfg = metaConfig();
  const page = await pageWithToken(biz.businessId, pageRowId);
  if (!cfg || !page || !/^\d+_\d+$/.test(postId)) return fail("That post isn't available.");

  let message = "";
  let photoCount = 0;
  try {
    const post = await pagePost(fetch, cfg, page.pageId, postId, page.token);
    message = (post.message ?? "").trim().slice(0, MAX_POST_CHARS);
    photoCount = postImageUrls(post).length;
  } catch (e) {
    if (e instanceof GraphError && e.tokenInvalid) return fail(RECONNECT_MESSAGE);
    return fail("Couldn't load that post from Facebook. Please try again.");
  }
  if (!message) return fail("That post has no text to fill the form from.");

  let values: Record<string, string> = { description: message };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const supabase = await createClient();
    const { data: ok } = await supabase.rpc("consume_rate_limit", { p_bucket: "post_import_hour", p_limit: 20, p_window_seconds: 3600 });
    if (ok !== true) return fail("You've filled a lot of listings from posts today. Please try again later.");
    try {
      const filled = await fillFromPost(new Anthropic({ apiKey }), process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, message);
      if (Object.keys(filled).length) values = filled;
    } catch (e) {
      console.error("post import failed", e instanceof Error ? e.message : e);
    }
  }
  return {
    values,
    missing: KEY_FIELDS.filter(([k]) => !values[k]).map(([, label]) => label),
    nonce: Date.now(),
    importRef: `${pageRowId}:${postId}`,
    photoCount,
  };
}

/** One entry point for the Add property form: a pasted post, or a post picked from a connected Page. */
export async function importListing(prev: ImportState, form: FormData): Promise<ImportState> {
  return str(form, "source") === "page" ? importPagePost(prev, form) : importFromPost(prev, form);
}
