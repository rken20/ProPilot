import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Facebook Pages over the Graph API with plain fetch (no SDK). Every call takes
 * a fetch so tests can stub it. Server calls carry appsecret_proof, so a stolen
 * token alone can't be used from somewhere else.
 */

type Fetch = typeof fetch;

export const DEFAULT_GRAPH_VERSION = "v25.0";
/** Read the Pages a person manages, read those Pages' posts, publish to them. */
export const DEFAULT_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];

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

async function post<T>(f: Fetch, cfg: MetaConfig, path: string, token: string, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams({ ...params, access_token: token, appsecret_proof: appSecretProof(token, cfg.appSecret) });
  return call<T>(f, graph(cfg, path), { method: "POST", body });
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

/** Pages the person granted ProPilot, each with its own Page token. */
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

/** Remove ProPilot's permissions from the person's Facebook account. */
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
