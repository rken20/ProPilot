import { describe, expect, it, vi } from "vitest";
import type { MetaConfig } from "./meta";
import { facebookNumbers, type FacebookPost } from "./post-analyst-facebook";

const cfg: MetaConfig = {
  appId: "123",
  appSecret: "shh",
  version: "v25.0",
  scopes: [],
};
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });
const refuse = (code: number, message: string) =>
  new Response(JSON.stringify({ error: { code, message } }), { status: 403 });
const metric = (name: string, value: unknown) => ({
  name,
  period: "lifetime",
  values: [{ value }],
});

const photo: FacebookPost = {
  id: "a",
  kind: "photos",
  pageId: "111",
  token: "tok",
  postId: "111_1",
  videoId: null,
};
const video: FacebookPost = {
  id: "b",
  kind: "video",
  pageId: "111",
  token: "tok",
  postId: null,
  videoId: "55555",
};
const pending: FacebookPost = {
  id: "c",
  kind: "video",
  pageId: "111",
  token: "tok",
  postId: null,
  videoId: "66666",
};

/** A stand-in for Facebook: answers by the address asked for. */
function facebook(insights: "on" | "no-permission") {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/v25.0/", "");
    if (path === "55555") return ok({ post_id: "2", id: "55555" });
    if (path === "66666") return ok({ id: "66666" });
    if (path === "111_1")
      return ok({
        reactions: { summary: { total_count: 10 } },
        comments: { summary: { total_count: 2 } },
        shares: { count: 1 },
      });
    if (path === "111_2")
      return ok({
        reactions: { summary: { total_count: 30 } },
        comments: { summary: { total_count: 5 } },
      });
    if (path.endsWith("/insights")) {
      if (insights === "no-permission")
        return refuse(
          10,
          "(#10) This endpoint requires the 'read_insights' permission",
        );
      const asked = url.searchParams.get("metric")!;
      const isVideo = path.startsWith("111_2");
      if (url.searchParams.get("breakdown") === "is_from_ads")
        return ok({
          data: [
            metric(
              "post_media_view",
              isVideo ? { true: 900, false: 300 } : { false: 400 },
            ),
          ],
        });
      if (asked === "post_media_view,post_clicks")
        return ok({
          data: [
            metric("post_media_view", isVideo ? 1200 : 400),
            metric("post_clicks", isVideo ? 44 : 9),
          ],
        });
      if (asked === "post_video_views,post_video_views_paid")
        return ok({
          data: [
            metric("post_video_views", 500),
            metric("post_video_views_paid", 380),
          ],
        });
      // One of the video metrics isn't known to this version of the API: Facebook fails the whole group.
      return refuse(100, "(#100) The value must be a valid insights metric");
    }
    return refuse(100, "unknown");
  });
}

describe("facebookNumbers", () => {
  it("reads reactions for every post, and views, ad views and video numbers when Facebook gives insights", async () => {
    const f = facebook("on");
    const got = await facebookNumbers(f as unknown as typeof fetch, cfg, [
      photo,
      video,
      pending,
    ]);
    expect(got.insights).toBe("on");
    expect(got.reconnect).toBe(false);
    expect(got.numbers.get("a")).toEqual({
      fb: { reactions: 10, comments: 2, shares: 1 },
      views: 400,
      adViews: 0,
      clicks: 9,
      video: null,
    });
    expect(got.numbers.get("b")).toEqual({
      fb: { reactions: 30, comments: 5, shares: 0 },
      views: 1200,
      adViews: 900,
      clicks: 44,
      // The group Facebook refused stays missing; the one it answered is kept.
      video: {
        plays: 500,
        paidPlays: 380,
        avgWatchMs: null,
        lengthMs: null,
        completes: null,
      },
    });
    // A video Facebook is still processing has no post to ask about.
    expect(got.numbers.get("c")).toEqual({
      fb: null,
      views: null,
      adViews: null,
      clicks: null,
      video: null,
    });
  });

  it("keeps reactions and stops asking for insights once Facebook refuses them", async () => {
    const f = facebook("no-permission");
    const got = await facebookNumbers(f as unknown as typeof fetch, cfg, [
      photo,
      video,
    ]);
    expect(got.insights).toBe("off");
    expect(got.numbers.get("a")).toEqual({
      fb: { reactions: 10, comments: 2, shares: 1 },
      views: null,
      adViews: null,
      clicks: null,
      video: null,
    });
    expect(got.numbers.get("b")!.fb).toEqual({
      reactions: 30,
      comments: 5,
      shares: 0,
    });
    const insightCalls = f.mock.calls.filter(([u]) =>
      String(u).includes("/insights"),
    );
    expect(insightCalls.length).toBe(1);
  });

  it("says when the Page has to be reconnected, and never throws", async () => {
    const expired = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 190, message: "Error validating access token" },
          }),
          { status: 400 },
        ),
    );
    const got = await facebookNumbers(expired as unknown as typeof fetch, cfg, [
      photo,
    ]);
    expect(got).toMatchObject({ insights: "off", reconnect: true });
    expect(got.numbers.get("a")!.fb).toBeNull();
    const down = vi.fn(async () => {
      throw new Error("network");
    });
    expect(
      (
        await facebookNumbers(down as unknown as typeof fetch, cfg, [
          photo,
          video,
        ])
      ).numbers.get("a")!.fb,
    ).toBeNull();
    expect(
      await facebookNumbers(down as unknown as typeof fetch, cfg, []),
    ).toMatchObject({ insights: "none", reconnect: false });
  });

  it("asks only about posts of the Page they were logged for", async () => {
    const f = facebook("on");
    const got = await facebookNumbers(f as unknown as typeof fetch, cfg, [
      { ...photo, postId: "999_1" },
    ]);
    expect(got.insights).toBe("none");
    expect(f).not.toHaveBeenCalled();
  });
});
