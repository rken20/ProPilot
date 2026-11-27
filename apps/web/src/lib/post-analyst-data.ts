import "server-only";
import { decryptSecret } from "@/lib/crypto";
import { metaConfig } from "@/lib/meta";
import {
  afterNumbers,
  countAfterPosts,
  WINDOW_DAYS,
  type AnalystInput,
  type PostRow,
} from "@/lib/post-analyst";
import {
  facebookNumbers,
  type FacebookPost,
  type FacebookRead,
} from "@/lib/post-analyst-facebook";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysAgoIso } from "@/lib/time";

/** How far back the Analyst looks, and how many posts it asks Facebook about. */
export const ANALYST_DAYS = 90;
export const ANALYST_POSTS = 12;

export type AnalystData = Omit<AnalystInput, "now" | "videoAds"> & {
  insights: FacebookRead["insights"];
  reconnect: boolean;
  /** Published posts in the period, which can be more than the ones shown. */
  published: number;
  /** Inquiries and Messenger chats about a listing in the 7 days after any of the posts shown, each counted once. */
  inquiries: number;
  chats: number;
};

const EMPTY: AnalystData = {
  posts: [],
  connected: false,
  listings: [],
  insights: "none",
  reconnect: false,
  published: 0,
  inquiries: 0,
  chats: 0,
};
const one = <T>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/**
 * Everything the Analyst shows for one business. Read with the service role,
 * as Reports is, so the counts are the business's and not only the leads this
 * person may open; every query is filtered to the business here, only counts
 * leave, and the caller checks the role first. Facebook is asked live, with
 * the business's own Page tokens, about the business's own posts.
 */
export async function loadAnalyst(
  businessId: string,
  now = new Date(),
): Promise<AnalystData> {
  const admin = createAdminClient();
  if (!admin) return EMPTY;
  const since = daysAgoIso(ANALYST_DAYS, now);
  const [postsRes, pagesRes, listingsRes, views30Res] = await Promise.all([
    admin
      .from("facebook_posts")
      .select(
        "id, kind, page_id, page_name, fb_post_id, fb_video_id, permalink_url, created_at, property_id, properties(id, name, is_public, status)",
        { count: "exact" },
      )
      .eq("business_id", businessId)
      .eq("status", "published")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(ANALYST_POSTS),
    admin
      .from("facebook_pages")
      .select("page_id, page_token_enc")
      .eq("business_id", businessId),
    admin
      .from("properties")
      .select("id, name, is_public")
      .eq("business_id", businessId)
      .eq("status", "available")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("listing_views")
      .select("property_id, views")
      .eq("business_id", businessId)
      .gte("day", daysAgoIso(30, now).slice(0, 10)),
  ]);
  const rows = postsRes.data ?? [];
  const cfg = metaConfig();
  const pages = pagesRes.data ?? [];

  const views30 = new Map<string, number>();
  for (const v of views30Res.data ?? [])
    views30.set(
      v.property_id as string,
      (views30.get(v.property_id as string) ?? 0) + Number(v.views),
    );
  const listings = (listingsRes.data ?? []).map((l) => ({
    id: l.id as string,
    name: l.name as string,
    isPublic: Boolean(l.is_public),
    views30: views30.get(l.id as string) ?? 0,
  }));
  const base = {
    connected: Boolean(cfg) && pages.length > 0,
    listings,
    published: postsRes.count ?? rows.length,
  };
  if (!rows.length) return { ...EMPTY, ...base };

  // The listings' own numbers around each post.
  const propertyIds = [
    ...new Set(
      rows
        .map((r) => r.property_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const earliest = rows[rows.length - 1]!.created_at as string;
  const from = new Date(
    new Date(earliest).getTime() - (WINDOW_DAYS + 1) * 86_400_000,
  ).toISOString();
  const [dayViews, inquiries, chats] = propertyIds.length
    ? await Promise.all([
        admin
          .from("listing_views")
          .select("property_id, day, views")
          .eq("business_id", businessId)
          .in("property_id", propertyIds)
          .gte("day", from.slice(0, 10)),
        admin
          .from("viewing_requests")
          .select("property_id, created_at")
          .eq("business_id", businessId)
          .in("property_id", propertyIds)
          .gte("created_at", earliest)
          .limit(5000),
        admin
          .from("messenger_conversations")
          .select("property_id, created_at")
          .eq("business_id", businessId)
          .in("property_id", propertyIds)
          .gte("created_at", earliest)
          .limit(5000),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const viewsBy = new Map<string, Map<string, number>>();
  for (const v of dayViews.data ?? []) {
    const id = v.property_id as string;
    if (!viewsBy.has(id)) viewsBy.set(id, new Map());
    viewsBy.get(id)!.set(String(v.day).slice(0, 10), Number(v.views));
  }
  const timesBy = (
    data: Array<{ property_id: unknown; created_at: unknown }> | null,
  ) => {
    const m = new Map<string, string[]>();
    for (const r of data ?? [])
      m.set(r.property_id as string, [
        ...(m.get(r.property_id as string) ?? []),
        r.created_at as string,
      ]);
    return m;
  };
  const inquiriesBy = timesBy(inquiries.data);
  const chatsBy = timesBy(chats.data);

  // Facebook's numbers, for posts on a Page that is still connected.
  const tokens = new Map<string, string>();
  for (const p of pages) {
    try {
      tokens.set(
        p.page_id as string,
        decryptSecret(p.page_token_enc as string),
      );
    } catch {
      // A token that can't be read is the same as a Page that isn't connected.
    }
  }
  const ask: FacebookPost[] = rows.flatMap((r) => {
    const token = tokens.get(r.page_id as string);
    return token
      ? [
          {
            id: r.id as string,
            kind: r.kind as PostRow["kind"],
            pageId: r.page_id as string,
            token,
            postId: (r.fb_post_id as string | null) ?? null,
            videoId: (r.fb_video_id as string | null) ?? null,
          },
        ]
      : [];
  });
  const fb: FacebookRead =
    cfg && ask.length
      ? await facebookNumbers(fetch, cfg, ask).catch(() => ({
          numbers: new Map(),
          insights: "none" as const,
          reconnect: false,
        }))
      : { numbers: new Map(), insights: "none", reconnect: false };

  type Listing = {
    id: string;
    name: string;
    is_public: boolean;
    status: string;
  };
  const posts: PostRow[] = rows.map((r) => {
    const l = one(r.properties as unknown as Listing | Listing[] | null);
    const got = fb.numbers.get(r.id as string);
    const link = r.permalink_url as string | null;
    return {
      id: r.id as string,
      kind: r.kind as PostRow["kind"],
      pageName: r.page_name as string,
      postedAt: r.created_at as string,
      permalink:
        link && /^https:\/\/([a-z0-9-]+\.)?facebook\.com\//.test(link)
          ? link
          : null,
      listing: l
        ? {
            id: l.id,
            name: l.name,
            isPublic: Boolean(l.is_public),
            forSale: l.status === "available",
          }
        : null,
      fb: got?.fb ?? null,
      views: got?.views ?? null,
      adViews: got?.adViews ?? null,
      clicks: got?.clicks ?? null,
      video: got?.video ?? null,
      after: l
        ? afterNumbers(
            r.created_at as string,
            now,
            viewsBy.get(l.id) ?? new Map(),
            inquiriesBy.get(l.id) ?? [],
            chatsBy.get(l.id) ?? [],
          )
        : null,
    };
  });
  const postTimes = new Map<string, string[]>();
  for (const p of posts)
    if (p.listing)
      postTimes.set(p.listing.id, [
        ...(postTimes.get(p.listing.id) ?? []),
        p.postedAt,
      ]);
  const after = (events: Map<string, string[]>) =>
    [...postTimes].reduce(
      (sum, [id, times]) =>
        sum + countAfterPosts(times, events.get(id) ?? [], now),
      0,
    );
  return {
    ...base,
    posts,
    insights: fb.insights,
    reconnect: fb.reconnect,
    inquiries: after(inquiriesBy),
    chats: after(chatsBy),
  };
}
