import {
  GraphError,
  fromAds,
  fullPostId,
  postEngagement,
  postInsights,
  videoPostId,
  type MetaConfig,
} from "@/lib/meta";
import type { PostRow } from "@/lib/post-analyst";

/**
 * Reads each post's numbers from Facebook for the Analyst. Reactions,
 * comments and shares need only the permission the Page connection already
 * has. Views, views from ads and video numbers are "insights": Facebook
 * gives them when the connection has `read_insights` and the Page has 100 or
 * more likes. One post is asked first; if Facebook refuses, the rest aren't
 * asked. Nothing here throws: a number that couldn't be read stays null.
 */

export type FacebookPost = {
  id: string;
  kind: PostRow["kind"];
  pageId: string;
  token: string;
  postId: string | null;
  videoId: string | null;
};
export type FacebookNumbers = Pick<
  PostRow,
  "fb" | "views" | "adViews" | "clicks" | "video"
>;
export type FacebookRead = {
  numbers: Map<string, FacebookNumbers>;
  /** on: Facebook gave view counts. off: it refused them. none: there was no post to ask about. */
  insights: "on" | "off" | "none";
  /** A Page's access has expired or was removed. */
  reconnect: boolean;
};

type Fetch = typeof fetch;
const EMPTY: FacebookNumbers = {
  fb: null,
  views: null,
  adViews: null,
  clicks: null,
  video: null,
};
const quiet = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

async function insightsOf(
  f: Fetch,
  cfg: MetaConfig,
  post: FacebookPost & { postId: string },
  core: Awaited<ReturnType<typeof postInsights>>,
): Promise<Omit<FacebookNumbers, "fb">> {
  const ask = (metrics: string[], breakdown?: string) =>
    quiet(
      postInsights(
        f,
        cfg,
        post.pageId,
        post.postId,
        post.token,
        metrics,
        breakdown,
      ),
    );
  const [split, plays, watch] = await Promise.all([
    ask(["post_media_view"], "is_from_ads"),
    post.kind === "video"
      ? ask(["post_video_views", "post_video_views_paid"])
      : null,
    post.kind === "video"
      ? ask([
          "post_video_avg_time_watched",
          "post_video_length",
          "post_video_complete_views_organic",
          "post_video_complete_views_paid",
        ])
      : null,
  ]);
  const total = (m: typeof core | null, name: string) =>
    m?.get(name)?.total ?? null;
  const whole = (v: number | null) => (v === null ? null : Math.round(v));
  const organicEnds = total(watch, "post_video_complete_views_organic");
  const paidEnds = total(watch, "post_video_complete_views_paid");
  return {
    views: whole(total(core, "post_media_view")),
    adViews: whole(fromAds(split?.get("post_media_view"))),
    clicks: whole(total(core, "post_clicks")),
    video:
      post.kind === "video"
        ? {
            plays: whole(total(plays, "post_video_views")),
            paidPlays: whole(total(plays, "post_video_views_paid")),
            avgWatchMs: whole(total(watch, "post_video_avg_time_watched")),
            lengthMs: whole(total(watch, "post_video_length")),
            completes:
              organicEnds === null && paidEnds === null
                ? null
                : Math.round((organicEnds ?? 0) + (paidEnds ?? 0)),
          }
        : null,
  };
}

export async function facebookNumbers(
  f: Fetch,
  cfg: MetaConfig,
  posts: FacebookPost[],
): Promise<FacebookRead> {
  const numbers = new Map<string, FacebookNumbers>(
    posts.map((p) => [p.id, { ...EMPTY }]),
  );
  let reconnect = false;
  const noteError = (e: unknown) => {
    // An expired or revoked token (190), not a missing permission.
    if (e instanceof GraphError && (e.code === 190 || e.code === 102))
      reconnect = true;
  };

  // The post each row stands for. A video's post exists only once Facebook has processed it.
  const ready = (
    await Promise.all(
      posts.map(async (p) => {
        let postId = p.postId ? fullPostId(p.pageId, p.postId) : null;
        if (!postId && p.videoId)
          postId = await videoPostId(
            f,
            cfg,
            p.pageId,
            p.videoId,
            p.token,
          ).catch((e) => (noteError(e), null));
        return postId ? { ...p, postId } : null;
      }),
    )
  ).filter((p): p is FacebookPost & { postId: string } => p !== null);
  if (!ready.length) return { numbers, insights: "none", reconnect };

  await Promise.all(
    ready.map(async (p) => {
      try {
        numbers.get(p.id)!.fb = await postEngagement(
          f,
          cfg,
          p.pageId,
          p.postId,
          p.token,
        );
      } catch (e) {
        noteError(e);
      }
    }),
  );

  // Ask one post for insights before asking them all.
  const [first, ...rest] = ready;
  const CORE = ["post_media_view", "post_clicks"];
  let probe: Awaited<ReturnType<typeof postInsights>>;
  try {
    probe = await postInsights(
      f,
      cfg,
      first!.pageId,
      first!.postId,
      first!.token,
      CORE,
    );
  } catch (e) {
    noteError(e);
    if (e instanceof GraphError)
      console.info("[analyst] Facebook gave no post insights:", e.message);
    return { numbers, insights: "off", reconnect };
  }
  const fill = async (
    p: FacebookPost & { postId: string },
    core: typeof probe | null,
  ) => {
    if (core)
      Object.assign(numbers.get(p.id)!, await insightsOf(f, cfg, p, core));
  };
  await Promise.all([
    fill(first!, probe),
    ...rest.map(async (p) =>
      fill(
        p,
        await quiet(postInsights(f, cfg, p.pageId, p.postId, p.token, CORE)),
      ),
    ),
  ]);
  return { numbers, insights: "on", reconnect };
}
