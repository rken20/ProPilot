import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Facebook Pages over the Graph API with plain fetch (no SDK). Every call takes
 * a fetch so tests can stub it. Server calls carry appsecret_proof, so a stolen
 * token alone can't be used from somewhere else.
 */

type Fetch = typeof fetch;

export const DEFAULT_GRAPH_VERSION = "v25.0";
/** Read the Pages a person manages, read and publish their posts, and answer their Messenger inbox. */
export const DEFAULT_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  // Messenger: receive messages (webhook subscription) and reply as the Page.
  "pages_manage_metadata",
  "pages_messaging",
];

export type MetaConfig = {
  appId: string;
  appSecret: string;
  version: string;
  /** Facebook Login for Business configuration; when set it replaces the scope list. */
  configId?: string;
  scopes: string[];
};

export function metaConfig(env: Record<string, string | undefined> = process.env): MetaConfig | null {
  const appId = env.META_APP_ID?.trim();
  const appSecret = env.META_APP_SECRET?.trim();
  if (!appId || !appSecret || !/^\d+$/.test(appId)) return null;
  const version = /^v\d{2}\.\d$/.test(env.META_GRAPH_VERSION ?? "") ? env.META_GRAPH_VERSION! : DEFAULT_GRAPH_VERSION;
  const extra = (env.META_EXTRA_SCOPES ?? "").split(",").map((s) => s.trim()).filter((s) => /^[a-z_]+$/.test(s));
  return {
    appId,
    appSecret,
    version,
    configId: /^\d+$/.test(env.META_LOGIN_CONFIG_ID ?? "") ? env.META_LOGIN_CONFIG_ID : undefined,
    scopes: [...new Set([...DEFAULT_SCOPES, ...extra])],
  };
}

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
  }
  /** Token expired, revoked, or the person lost access to the Page. */
  get tokenInvalid() {
    return this.code === 190 || this.code === 102 || this.code === 10 || this.code === 200;
  }
}

export function appSecretProof(token: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(token).digest("hex");
}

const graph = (cfg: MetaConfig, path: string) => `https://graph.facebook.com/${cfg.version}/${path.replace(/^\//, "")}`;

async function call<T>(f: Fetch, url: string, init?: RequestInit): Promise<T> {
  const res = await f(url, { ...init, redirect: "error", signal: init?.signal ?? AbortSignal.timeout(20_000) });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  const err = (body as { error?: { message?: string; code?: number } } | null)?.error;
  if (!res.ok || err) {
    // Graph error messages don't contain tokens; keep them short for logs and the post log.
    throw new GraphError(`Facebook ${res.status}: ${(err?.message ?? "request failed").slice(0, 200)}`, res.status, err?.code);
  }
  return body as T;
}

async function get<T>(f: Fetch, cfg: MetaConfig, path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const q = new URLSearchParams({ ...params, access_token: token, appsecret_proof: appSecretProof(token, cfg.appSecret) });
  return call<T>(f, `${graph(cfg, path)}?${q}`);
}

/** A read that a page waits on: it gives up after a few seconds instead of twenty. */
async function getFast<T>(f: Fetch, cfg: MetaConfig, path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const q = new URLSearchParams({ ...params, access_token: token, appsecret_proof: appSecretProof(token, cfg.appSecret) });
  return call<T>(f, `${graph(cfg, path)}?${q}`, { signal: AbortSignal.timeout(7000) });
}

async function post<T>(f: Fetch, cfg: MetaConfig, path: string, token: string, params: Record<string, string>, timeoutMs?: number): Promise<T> {
  const body = new URLSearchParams({ ...params, access_token: token, appsecret_proof: appSecretProof(token, cfg.appSecret) });
  return call<T>(f, graph(cfg, path), { method: "POST", body, ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}) });
}

// ------------------------------------------------------------------ login

export function dialogUrl(cfg: MetaConfig, redirectUri: string, state: string): string {
  const u = new URL(`https://www.facebook.com/${cfg.version}/dialog/oauth`);
  u.searchParams.set("client_id", cfg.appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  if (cfg.configId) u.searchParams.set("config_id", cfg.configId);
  else u.searchParams.set("scope", cfg.scopes.join(","));
  return u.toString();
}

export async function exchangeCode(f: Fetch, cfg: MetaConfig, code: string, redirectUri: string): Promise<string> {
  const q = new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.appSecret, redirect_uri: redirectUri, code });
  const r = await call<{ access_token: string }>(f, `${graph(cfg, "oauth/access_token")}?${q}`);
  return r.access_token;
}

/** Swap a short-lived user token for a long-lived one; Page tokens from it don't expire. */
export async function longLivedUserToken(f: Fetch, cfg: MetaConfig, shortToken: string): Promise<string> {
  const q = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    fb_exchange_token: shortToken,
  });
  const r = await call<{ access_token: string }>(f, `${graph(cfg, "oauth/access_token")}?${q}`);
  return r.access_token;
}

export async function meId(f: Fetch, cfg: MetaConfig, userToken: string): Promise<string> {
  return (await get<{ id: string }>(f, cfg, "me", userToken, { fields: "id" })).id;
}

export type ManagedPage = { id: string; name: string; access_token: string; tasks?: string[] };

/** Pages the person granted MyHomeSeller, each with its own Page token. */
export async function managedPages(f: Fetch, cfg: MetaConfig, userToken: string): Promise<ManagedPage[]> {
  const out: ManagedPage[] = [];
  let after: string | undefined;
  for (let i = 0; i < 5; i++) {
    const params: Record<string, string> = { fields: "id,name,access_token,tasks", limit: "100" };
    if (after) params.after = after;
    const r = await get<{ data: ManagedPage[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      f,
      cfg,
      "me/accounts",
      userToken,
      params,
    );
    out.push(...r.data.filter((p) => /^\d+$/.test(p.id) && p.access_token));
    after = r.paging?.next ? r.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}

/** Remove MyHomeSeller's permissions from the person's Facebook account. */
export async function revokeApp(f: Fetch, cfg: MetaConfig, userToken: string): Promise<void> {
  const q = new URLSearchParams({ access_token: userToken, appsecret_proof: appSecretProof(userToken, cfg.appSecret) });
  await call(f, `${graph(cfg, "me/permissions")}?${q}`, { method: "DELETE" });
}

/** Can this Page token post? (The person needs the CREATE_CONTENT task on the Page.) */
export const canPublish = (tasks: string[] | null | undefined) => Boolean(tasks?.includes("CREATE_CONTENT"));

// ------------------------------------------------------------------ reading posts

export type PagePost = {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  full_picture?: string;
  attachments?: { data: Attachment[] };
};
type Attachment = {
  media_type?: string;
  media?: { image?: { src?: string } };
  subattachments?: { data: Attachment[] };
};

const POST_FIELDS =
  "id,message,created_time,permalink_url,full_picture,attachments{media_type,media{image{src}},subattachments.limit(20){media_type,media{image{src}}}}";

export async function recentPosts(f: Fetch, cfg: MetaConfig, pageId: string, pageToken: string, limit = 15): Promise<PagePost[]> {
  const r = await get<{ data: PagePost[] }>(f, cfg, `${pageId}/published_posts`, pageToken, {
    fields: POST_FIELDS,
    limit: String(limit),
  });
  return r.data;
}

/** One post, only if it belongs to this Page (post IDs are "<pageId>_<n>"). */
export async function pagePost(f: Fetch, cfg: MetaConfig, pageId: string, postId: string, pageToken: string): Promise<PagePost> {
  if (!new RegExp(`^${pageId}_\\d+$`).test(postId)) throw new GraphError("post is not from this Page", 400);
  return get<PagePost>(f, cfg, postId, pageToken, { fields: POST_FIELDS });
}

/** Photo URLs in a post, largest-first as Facebook gives them, photos only. */
export function postImageUrls(post: PagePost, max = 20): string[] {
  const urls: string[] = [];
  const visit = (a: Attachment) => {
    if (a.subattachments?.data?.length) a.subattachments.data.forEach(visit);
    else if ((a.media_type ?? "photo") === "photo" && a.media?.image?.src) urls.push(a.media.image.src);
  };
  post.attachments?.data?.forEach(visit);
  if (!urls.length && post.full_picture && !post.attachments?.data?.some((a) => a.media_type === "video")) urls.push(post.full_picture);
  return [...new Set(urls)].filter(isFacebookImageUrl).slice(0, max);
}

/** Only download from Facebook's own image hosts, over https (no server-side requests elsewhere). */
export function isFacebookImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
    const h = u.hostname.toLowerCase();
    return h === "fbcdn.net" || h.endsWith(".fbcdn.net") || h.endsWith(".fbsbx.com");
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ how a post is doing

/** The full id of a Page's post, "<pageId>_<n>". A video's post id sometimes comes back as the number alone. */
export function fullPostId(pageId: string, postId: string): string | null {
  if (new RegExp(`^${pageId}_\\d+$`).test(postId)) return postId;
  return /^\d+$/.test(postId) && /^\d+$/.test(pageId) ? `${pageId}_${postId}` : null;
}

/** The post a Page video belongs to, once Facebook has finished processing it. */
export async function videoPostId(f: Fetch, cfg: MetaConfig, pageId: string, videoId: string, pageToken: string): Promise<string | null> {
  if (!/^\d{5,30}$/.test(videoId)) return null;
  const r = await getFast<{ post_id?: string }>(f, cfg, videoId, pageToken, { fields: "post_id" });
  return r.post_id ? fullPostId(pageId, r.post_id) : null;
}

export type PostEngagement = { reactions: number; comments: number; shares: number };

/** Reactions, comments and shares on one of the Page's own posts. Needs only `pages_read_engagement`. */
export async function postEngagement(f: Fetch, cfg: MetaConfig, pageId: string, postId: string, pageToken: string): Promise<PostEngagement> {
  if (!new RegExp(`^${pageId}_\\d+$`).test(postId)) throw new GraphError("post is not from this Page", 400);
  const r = await getFast<{ reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } }; shares?: { count?: number } }>(f, cfg, postId, pageToken, {
    fields: "reactions.summary(true).limit(0),comments.summary(true).limit(0),shares",
  });
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
  return { reactions: n(r.reactions?.summary?.total_count), comments: n(r.comments?.summary?.total_count), shares: n(r.shares?.count) };
}

/** One metric as Facebook returned it: a number, and its parts when a breakdown was asked for. */
export type InsightValue = { total: number | null; parts: Record<string, number> };

/**
 * Lifetime insights of one of the Page's own posts. Needs `read_insights` on
 * the connection, and Facebook gives them only for Pages with 100 or more
 * likes. One unknown metric fails the whole request, so callers ask in small
 * groups and treat a failure as "not available".
 */
export async function postInsights(f: Fetch, cfg: MetaConfig, pageId: string, postId: string, pageToken: string, metrics: string[], breakdown?: string): Promise<Map<string, InsightValue>> {
  if (!new RegExp(`^${pageId}_\\d+$`).test(postId)) throw new GraphError("post is not from this Page", 400);
  if (!metrics.length || metrics.some((m) => !/^[a-z0-9_]+$/.test(m)) || (breakdown && !/^[a-z_]+$/.test(breakdown))) throw new GraphError("bad metric", 400);
  const raw = await getFast<unknown>(f, cfg, `${postId}/insights`, pageToken, { metric: metrics.join(","), period: "lifetime", ...(breakdown ? { breakdown } : {}) });
  return readInsights(raw);
}

/**
 * Reads an insights answer without assuming one shape. A plain metric is
 * `values: [{ value: 123 }]`. With a breakdown, Facebook's documentation gives
 * no example, so this accepts the shapes its insights use elsewhere: an object
 * of parts as the value, parts one level down, a `total_value` with
 * `breakdowns`, or one entry per part. Anything else is left out, never guessed.
 */
export function readInsights(raw: unknown): Map<string, InsightValue> {
  const out = new Map<string, InsightValue>();
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
  const data = (raw as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return out;
  for (const entry of data as Array<Record<string, unknown>>) {
    const name = typeof entry?.name === "string" ? entry.name : null;
    if (!name) continue;
    const slot = out.get(name) ?? { total: null, parts: {} };
    const addPart = (key: unknown, value: unknown) => {
      const n = num(value);
      if (n !== null && (typeof key === "string" || typeof key === "number" || typeof key === "boolean")) slot.parts[String(key).toLowerCase()] = (slot.parts[String(key).toLowerCase()] ?? 0) + n;
    };
    const readValue = (value: unknown, label?: unknown) => {
      const n = num(value);
      if (n !== null) {
        if (label === undefined) slot.total = (slot.total ?? 0) + n;
        else addPart(label, n);
        return;
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          if (num(v) !== null) addPart(k, v);
          else if (v && typeof v === "object" && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) addPart(k2, v2);
        }
      }
    };
    // One entry per part: the part's name sits beside the value.
    const label = [entry.breakdown_value, entry.dimension_value, (entry.dimension_values as unknown[] | undefined)?.[0]].find((v) => v !== undefined);
    const values = Array.isArray(entry.values) ? (entry.values as Array<Record<string, unknown>>) : [];
    // Lifetime metrics carry one value; when there are several, the last is the newest.
    const last = values[values.length - 1];
    if (last) readValue(last.value, label ?? last.breakdown_value ?? (last.dimension_values as unknown[] | undefined)?.[0]);
    const tv = entry.total_value as { value?: unknown; breakdowns?: Array<{ results?: Array<{ dimension_values?: unknown[]; value?: unknown }> }> } | undefined;
    if (tv) {
      if (!last && num(tv.value) !== null) slot.total = num(tv.value);
      for (const b of tv.breakdowns ?? []) for (const r of b.results ?? []) addPart(r.dimension_values?.[0], r.value);
    }
    out.set(name, slot);
  }
  return out;
}

/**
 * How many of a breakdown's views came from ads. Facebook leaves out parts
 * that are zero, so "only the not-from-ads part came back" means none. Null
 * when the answer doesn't say which part is which.
 */
export function fromAds(v: InsightValue | undefined): number | null {
  if (!v) return null;
  const yes = ["true", "1", "yes", "ads", "paid", "is_from_ads"];
  const no = ["false", "0", "no", "organic", "not_from_ads"];
  const keys = Object.keys(v.parts);
  const hit = keys.filter((k) => yes.includes(k));
  if (hit.length) return hit.reduce((n, k) => n + v.parts[k]!, 0);
  return keys.some((k) => no.includes(k)) ? 0 : null;
}

// ------------------------------------------------------------------ publishing

/** Upload a photo to the Page without posting it, to attach to a post. Facebook fetches `url`. */
export async function uploadPhoto(f: Fetch, cfg: MetaConfig, pageId: string, pageToken: string, url: string): Promise<string> {
  const r = await post<{ id: string }>(f, cfg, `${pageId}/photos`, pageToken, { url, published: "false" });
  return r.id;
}

/** Publish a post to the Page, with photos already uploaded by uploadPhoto. */
export async function publishPost(
  f: Fetch,
  cfg: MetaConfig,
  pageId: string,
  pageToken: string,
  message: string,
  photoIds: string[] = [],
): Promise<{ id: string; permalink?: string }> {
  const params: Record<string, string> = { message };
  photoIds.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
  const { id } = await post<{ id: string }>(f, cfg, `${pageId}/feed`, pageToken, params);
  let permalink: string | undefined;
  try {
    permalink = (await get<{ permalink_url?: string }>(f, cfg, id, pageToken, { fields: "permalink_url" })).permalink_url;
  } catch {
    /* the post is up; the link is a nicety */
  }
  return { id, permalink: permalink?.startsWith("https://") ? permalink : undefined };
}

export const MAX_VIDEO_TITLE = 100;

/**
 * Publish a video to the Page. Facebook fetches the file from `fileUrl` itself,
 * so the link has to work without signing in and for long enough to be fetched.
 * The post's own id and link come from a second read and may be missing while
 * Facebook is still processing the video.
 */
export async function publishVideo(
  f: Fetch,
  cfg: MetaConfig,
  pageId: string,
  pageToken: string,
  fileUrl: string,
  description: string,
  title: string,
): Promise<{ videoId: string; postId?: string; permalink?: string }> {
  // Fetching a video takes Facebook longer than a text post does.
  const { id } = await post<{ id: string }>(f, cfg, `${pageId}/videos`, pageToken, { file_url: fileUrl, description, title: title.slice(0, MAX_VIDEO_TITLE) }, 50_000);
  let postId: string | undefined;
  let permalink: string | undefined;
  try {
    const more = await get<{ post_id?: string; permalink_url?: string }>(f, cfg, id, pageToken, { fields: "post_id,permalink_url" });
    if (/^\d+(_\d+)?$/.test(more.post_id ?? "")) postId = more.post_id;
    // A video's link comes back as a path on facebook.com.
    const link = more.permalink_url ?? "";
    permalink = link.startsWith("https://") ? link : /^\/[^/]/.test(link) ? `https://www.facebook.com${link}` : undefined;
  } catch {
    /* the video is up; the link is a nicety */
  }
  return { videoId: id, postId, permalink };
}

// ------------------------------------------------------------------ data deletion

/** Verify and decode the signed_request Meta sends to the data deletion callback. */
export function parseSignedRequest(signed: string, appSecret: string): { user_id: string } | null {
  const [sig, payload] = signed.split(".");
  if (!sig || !payload) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { algorithm?: string; user_id?: unknown };
    if (data.algorithm?.toUpperCase() !== "HMAC-SHA256" || typeof data.user_id !== "string" || !/^\d+$/.test(data.user_id)) return null;
    return { user_id: data.user_id };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ Messenger

/** Facebook's own Page inbox app: echoes with this app_id are a person replying in Meta Business Suite. */
export const PAGE_INBOX_APP_ID = "26390203743090";
export const MESSENGER_FIELDS = ["messages", "messaging_postbacks", "message_echoes"];
/** Messenger's limit is 2,000 characters a message. */
export const MAX_MESSENGER_TEXT = 2000;

/** Check X-Hub-Signature-256 on a webhook delivery against the raw body. */
export function verifyWebhookSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header ?? "");
  if (!m) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const got = Buffer.from(m[1]!, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Start (or stop) Messenger webhooks for a Page. */
export async function subscribePage(f: Fetch, cfg: MetaConfig, pageId: string, pageToken: string): Promise<void> {
  await post(f, cfg, `${pageId}/subscribed_apps`, pageToken, { subscribed_fields: MESSENGER_FIELDS.join(",") });
}
export async function unsubscribePage(f: Fetch, cfg: MetaConfig, pageId: string, pageToken: string): Promise<void> {
  const q = new URLSearchParams({ access_token: pageToken, appsecret_proof: appSecretProof(pageToken, cfg.appSecret) });
  await call(f, `${graph(cfg, `${pageId}/subscribed_apps`)}?${q}`, { method: "DELETE" });
}

/** Reply to someone who messaged the Page (inside Messenger's 24-hour window). Returns the message id. */
export async function sendMessage(
  f: Fetch,
  cfg: MetaConfig,
  pageId: string,
  pageToken: string,
  psid: string,
  text: string,
): Promise<string | undefined> {
  const r = await post<{ message_id?: string }>(f, cfg, `${pageId}/messages`, pageToken, {
    recipient: JSON.stringify({ id: psid }),
    messaging_type: "RESPONSE",
    message: JSON.stringify({ text: text.slice(0, MAX_MESSENGER_TEXT) }),
  });
  return r.message_id;
}

/** Show "typing…" in Messenger while the assistant writes. Best effort. */
export async function typingOn(f: Fetch, cfg: MetaConfig, pageId: string, pageToken: string, psid: string): Promise<void> {
  try {
    await post(f, cfg, `${pageId}/messages`, pageToken, { recipient: JSON.stringify({ id: psid }), sender_action: "typing_on" });
  } catch {
    /* cosmetic */
  }
}

/** The name someone shows on Messenger, if Facebook shares it with the app. */
export async function messengerName(f: Fetch, cfg: MetaConfig, psid: string, pageToken: string): Promise<string | null> {
  try {
    const r = await get<{ first_name?: string; last_name?: string; name?: string }>(f, cfg, psid, pageToken, { fields: "first_name,last_name" });
    const name = (r.name ?? [r.first_name, r.last_name].filter(Boolean).join(" ")).trim();
    return name ? name.slice(0, 120) : null;
  } catch {
    return null;
  }
}

export type MessengerEvent = {
  pageId: string;
  psid: string;
  timestamp: number;
  mid?: string;
  text?: string;
  /** "photo", "audio" etc. when the message is an attachment without text. */
  attachment?: string;
  /** A message the Page sent; appId says whether MyHomeSeller or Facebook's inbox sent it. */
  echo?: { appId: string };
  postback?: string;
};

/** Pull the messaging events we handle out of a webhook body. Anything odd is skipped. */
export function parseWebhook(body: unknown): MessengerEvent[] {
  const b = body as { object?: string; entry?: Array<{ id?: unknown; messaging?: unknown[] }> } | null;
  if (b?.object !== "page" || !Array.isArray(b.entry)) return [];
  const out: MessengerEvent[] = [];
  for (const entry of b.entry.slice(0, 50)) {
    const pageId = String(entry.id ?? "");
    if (!/^\d+$/.test(pageId) || !Array.isArray(entry.messaging)) continue;
    for (const raw of entry.messaging.slice(0, 50)) {
      const e = raw as {
        sender?: { id?: string };
        recipient?: { id?: string };
        timestamp?: number;
        message?: { mid?: string; text?: string; is_echo?: boolean; app_id?: number | string; attachments?: Array<{ type?: string }> };
        postback?: { title?: string; payload?: string };
      };
      const echo = Boolean(e.message?.is_echo);
      const psid = String((echo ? e.recipient?.id : e.sender?.id) ?? "");
      if (!/^\d+$/.test(psid) || psid === pageId) continue;
      const ev: MessengerEvent = { pageId, psid, timestamp: Number(e.timestamp) || Date.now() };
      if (e.message) {
        ev.mid = typeof e.message.mid === "string" ? e.message.mid.slice(0, 200) : undefined;
        if (typeof e.message.text === "string") ev.text = e.message.text.slice(0, 2000);
        else if (e.message.attachments?.length) ev.attachment = String(e.message.attachments[0]?.type ?? "file").slice(0, 20);
        if (echo) ev.echo = { appId: String(e.message.app_id ?? "") };
      } else if (e.postback) {
        ev.postback = String(e.postback.title ?? e.postback.payload ?? "").slice(0, 200);
      } else {
        continue; // reads, deliveries, reactions: not needed
      }
      out.push(ev);
    }
  }
  return out;
}

// ------------------------------------------------------------------ for the Marketing API (lib/meta-ads.ts)

export const graphGet = get;
export const graphGetFast = getFast;
export const graphPost = post;
