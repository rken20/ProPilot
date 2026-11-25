"use server";

import { appSay } from "@/lib/lang-server";
import Anthropic from "@anthropic-ai/sdk";
import { can } from "@propilot/shared";
import { requireBusiness } from "@/lib/auth";
import { str } from "@/lib/form";
import { DEFAULT_MODEL } from "@/lib/listing-assistant";
import { pageWithToken, RECONNECT_MESSAGE } from "@/lib/facebook-pages";
import { GraphError, metaConfig, pagePost, postImageUrls, recentPosts } from "@/lib/meta";
import { fillFromPost, KEY_FIELDS, MAX_POST_CHARS } from "@/lib/post-import";
import { createClient } from "@/lib/supabase/server";
import { aiEnabled } from "@/lib/plan";
import { upgradeMessage } from "@/lib/plan-rules";

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
  const say = await appSay();
  // On an error, keep the last fill so the form and the open paste box don't reset.
  const fail = (error: string): ImportState => ({ values: prev.values, missing: prev.missing, nonce: prev.nonce, error });
  const biz = await requireBusiness();
  if (!can(biz.role, "property.create")) return fail(say("Your role can't add properties.", "Hindi pwedeng mag-add ng properties ang role mo."));

  const post = str(form, "post");
  if (post.length < 20) return fail(say("Paste the full text of your post first.", "I-paste muna ang buong text ng post mo."));
  if (post.length > MAX_POST_CHARS) return fail(say(`That's over ${MAX_POST_CHARS.toLocaleString()} characters. Paste one listing at a time.`, `Lampas ${MAX_POST_CHARS.toLocaleString()} characters iyan. Isang listing lang ang i-paste sa bawat pagkakataon.`));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fail(say("Filling from a post isn't switched on yet.", "Hindi pa naka-on ang pag-fill mula sa post."));
  if (!(await aiEnabled(biz.businessId))) return fail(upgradeMessage(say));

  const supabase = await createClient();
  const [hour, day] = await Promise.all([
    supabase.rpc("consume_rate_limit", { p_bucket: "post_import_hour", p_limit: 20, p_window_seconds: 3600 }),
    supabase.rpc("consume_rate_limit", { p_bucket: "post_import_day", p_limit: 60, p_window_seconds: 86400 }),
  ]);
  if (hour.error || day.error || hour.data !== true || day.data !== true) {
    return fail(say("You've filled a lot of listings from posts today. Please try again later.", "Marami ka nang na-fill na listing mula sa posts ngayong araw. Paki-try ulit mamaya."));
  }

  let values: Record<string, string>;
  try {
    values = await fillFromPost(new Anthropic({ apiKey }), process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, post);
  } catch (e) {
    console.error("post import failed", e instanceof Error ? e.message : e);
    return fail(say("Couldn't read the post just now. Please try again in a minute.", "Hindi nabasa ang post ngayon. Paki-try ulit pagkalipas ng isang minuto."));
  }
  if (!values.name && !values.price && !values.location) {
    return fail(say("Couldn't find listing details in that text. Check you pasted the whole post.", "Walang nakitang listing details sa text na iyan. I-check kung buong post ang na-paste mo."));
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
  const say = await appSay();
  const biz = await requireBusiness();
  if (!can(biz.role, "property.create")) return { error: say("Your role can't add properties.", "Hindi pwedeng mag-add ng properties ang role mo.") };
  const cfg = metaConfig();
  const page = await pageWithToken(biz.businessId, pageRowId);
  if (!cfg || !page) return { error: say("That Page isn't connected.", "Hindi naka-connect ang Page na iyan.") };
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
    return { error: say("Couldn't load posts from Facebook. Please try again.", "Hindi na-load ang posts mula sa Facebook. Paki-try ulit.") };
  }
}

/** Fill the form from one of the business's own Page posts. Its photos are copied when the listing is saved. */
export async function importPagePost(prev: ImportState, form: FormData): Promise<ImportState> {
  const say = await appSay();
  const fail = (error: string): ImportState => ({ ...prev, error });
  const biz = await requireBusiness();
  if (!can(biz.role, "property.create")) return fail(say("Your role can't add properties.", "Hindi pwedeng mag-add ng properties ang role mo."));
  const pageRowId = str(form, "page");
  const postId = str(form, "postId");
  const cfg = metaConfig();
  const page = await pageWithToken(biz.businessId, pageRowId);
  if (!cfg || !page || !/^\d+_\d+$/.test(postId)) return fail(say("That post isn't available.", "Hindi available ang post na iyan."));

  let message = "";
  let photoCount = 0;
  try {
    const post = await pagePost(fetch, cfg, page.pageId, postId, page.token);
    message = (post.message ?? "").trim().slice(0, MAX_POST_CHARS);
    photoCount = postImageUrls(post).length;
  } catch (e) {
    if (e instanceof GraphError && e.tokenInvalid) return fail(RECONNECT_MESSAGE);
    return fail(say("Couldn't load that post from Facebook. Please try again.", "Hindi na-load ang post na iyan mula sa Facebook. Paki-try ulit."));
  }
  if (!message) return fail(say("That post has no text to fill the form from.", "Walang text ang post na iyan na pwedeng pang-fill sa form."));

  let values: Record<string, string> = { description: message };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  // On Free, the post's text goes into the description and the rest is typed by hand.
  if (apiKey && (await aiEnabled(biz.businessId))) {
    const supabase = await createClient();
    const { data: ok } = await supabase.rpc("consume_rate_limit", { p_bucket: "post_import_hour", p_limit: 20, p_window_seconds: 3600 });
    if (ok !== true) return fail(say("You've filled a lot of listings from posts today. Please try again later.", "Marami ka nang na-fill na listing mula sa posts ngayong araw. Paki-try ulit mamaya."));
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
