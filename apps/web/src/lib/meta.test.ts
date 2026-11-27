import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  appSecretProof,
  fromAds,
  fullPostId,
  postEngagement,
  postInsights,
  readInsights,
  videoPostId,
  canPublish,
  dialogUrl,
  GraphError,
  isFacebookImageUrl,
  managedPages,
  metaConfig,
  pagePost,
  parseSignedRequest,
  postImageUrls,
  publishPost,
  publishVideo,
  type MetaConfig,
} from "./meta";

const cfg: MetaConfig = { appId: "123", appSecret: "shh", version: "v25.0", scopes: ["pages_show_list"] };
const json = (body: unknown, status = 200) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("metaConfig", () => {
  it("needs a numeric app id and a secret, and ignores bad optional values", () => {
    expect(metaConfig({ META_APP_ID: "abc", META_APP_SECRET: "x" })).toBeNull();
    const c = metaConfig({ META_APP_ID: "123", META_APP_SECRET: "x", META_GRAPH_VERSION: "latest", META_EXTRA_SCOPES: "business_management, bad scope!" });
    expect(c?.version).toBe("v25.0");
    expect(c?.scopes).toEqual([
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "pages_manage_metadata",
      "pages_messaging",
      "business_management",
    ]);
  });
});

describe("dialogUrl", () => {
  it("uses the login configuration when set, the scopes otherwise", () => {
    const withScopes = new URL(dialogUrl(cfg, "https://app.test/api/meta/callback", "st"));
    expect(withScopes.searchParams.get("scope")).toBe("pages_show_list");
    expect(withScopes.searchParams.get("state")).toBe("st");
    const withConfig = new URL(dialogUrl({ ...cfg, configId: "999" }, "https://app.test/cb", "st"));
    expect(withConfig.searchParams.get("config_id")).toBe("999");
    expect(withConfig.searchParams.has("scope")).toBe(false);
  });
});

describe("Graph calls", () => {
  it("sends appsecret_proof and reads Pages across pages of results", async () => {
    const f = vi
      .fn()
      .mockImplementationOnce(json({ data: [{ id: "1", name: "A", access_token: "t1" }], paging: { next: "x", cursors: { after: "c" } } }))
      .mockImplementationOnce(json({ data: [{ id: "2", name: "B", access_token: "t2" }, { id: "evil/../x", name: "C", access_token: "t3" }] }));
    const pages = await managedPages(f, cfg, "usertoken");
    expect(pages.map((p) => p.id)).toEqual(["1", "2"]);
    const first = new URL(f.mock.calls[0]![0]);
    expect(first.searchParams.get("appsecret_proof")).toBe(appSecretProof("usertoken", "shh"));
    expect(new URL(f.mock.calls[1]![0]).searchParams.get("after")).toBe("c");
  });

  it("turns Graph errors into GraphError and spots dead tokens", async () => {
    const f = vi.fn().mockImplementation(json({ error: { message: "Session expired", code: 190 } }, 400));
    const err = await managedPages(f, cfg, "t").catch((e) => e);
    expect(err).toBeInstanceOf(GraphError);
    expect(err.tokenInvalid).toBe(true);
  });

  it("refuses a post that isn't from the Page", async () => {
    const f = vi.fn();
    await expect(pagePost(f, cfg, "111", "222_1", "t")).rejects.toThrow(/not from this Page/);
    expect(f).not.toHaveBeenCalled();
  });

  it("publishes a post with attached photos", async () => {
    const f = vi
      .fn()
      .mockImplementationOnce(json({ id: "111_9" }))
      .mockImplementationOnce(json({ permalink_url: "https://www.facebook.com/111/posts/9" }));
    const r = await publishPost(f, cfg, "111", "pt", "Hello", ["p1", "p2"]);
    expect(r).toEqual({ id: "111_9", permalink: "https://www.facebook.com/111/posts/9" });
    const body = f.mock.calls[0]![1].body as URLSearchParams;
    expect(body.get("message")).toBe("Hello");
    expect(body.get("attached_media[1]")).toBe('{"media_fbid":"p2"}');
  });

  it("publishes a video from a link Facebook fetches, and reads back its post and link", async () => {
    const f = vi
      .fn()
      .mockImplementationOnce(json({ id: "9001" }))
      .mockImplementationOnce(json({ post_id: "111_9002", permalink_url: "/page/videos/9001/" }));
    const r = await publishVideo(f, cfg, "111", "pt", "https://files.example/v.mp4?token=abc", "Caption", "T".repeat(140));
    expect(r).toEqual({ videoId: "9001", postId: "111_9002", permalink: "https://www.facebook.com/page/videos/9001/" });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v25.0/111/videos");
    const body = init.body as URLSearchParams;
    expect(body.get("file_url")).toBe("https://files.example/v.mp4?token=abc");
    expect(body.get("description")).toBe("Caption");
    expect(body.get("title")).toHaveLength(100);
    expect(body.get("appsecret_proof")).toBe(appSecretProof("pt", "shh"));
  });

  it("still counts a video as posted when its link can't be read yet", async () => {
    const f = vi.fn().mockImplementationOnce(json({ id: "9001" })).mockImplementationOnce(json({ error: { message: "processing", code: 100 } }, 400));
    expect(await publishVideo(f, cfg, "111", "pt", "https://files.example/v.mp4", "Caption", "Title")).toEqual({ videoId: "9001", postId: undefined, permalink: undefined });
  });
});

describe("post photos", () => {
  it("collects album photos, skips videos and non-Facebook hosts", () => {
    const urls = postImageUrls({
      id: "1_2",
      created_time: "",
      attachments: {
        data: [
          {
            media_type: "album",
            subattachments: {
              data: [
                { media_type: "photo", media: { image: { src: "https://scontent.xx.fbcdn.net/a.jpg" } } },
                { media_type: "video", media: { image: { src: "https://scontent.xx.fbcdn.net/v.jpg" } } },
                { media_type: "photo", media: { image: { src: "https://evil.example/b.jpg" } } },
              ],
            },
          },
        ],
      },
    });
    expect(urls).toEqual(["https://scontent.xx.fbcdn.net/a.jpg"]);
  });

  it("only trusts Facebook image hosts", () => {
    expect(isFacebookImageUrl("https://scontent-sin6-1.xx.fbcdn.net/v/x.jpg")).toBe(true);
    expect(isFacebookImageUrl("https://fbcdn.net.evil.example/x.jpg")).toBe(false);
    expect(isFacebookImageUrl("http://scontent.xx.fbcdn.net/x.jpg")).toBe(false);
    expect(isFacebookImageUrl("https://169.254.169.254/latest")).toBe(false);
  });

  it("needs CREATE_CONTENT to publish", () => {
    expect(canPublish(["MODERATE", "CREATE_CONTENT"])).toBe(true);
    expect(canPublish(["ANALYZE"])).toBe(false);
  });
});

describe("parseSignedRequest", () => {
  const sign = (payload: object, secret = "shh") => {
    const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${createHmac("sha256", secret).update(p).digest("base64url")}.${p}`;
  };

  it("accepts a correctly signed request", () => {
    expect(parseSignedRequest(sign({ algorithm: "HMAC-SHA256", user_id: "555" }), "shh")).toEqual({ user_id: "555" });
  });

  it("rejects a wrong signature, wrong algorithm or odd user id", () => {
    expect(parseSignedRequest(sign({ algorithm: "HMAC-SHA256", user_id: "555" }, "other"), "shh")).toBeNull();
    expect(parseSignedRequest(sign({ algorithm: "none", user_id: "555" }), "shh")).toBeNull();
    expect(parseSignedRequest(sign({ algorithm: "HMAC-SHA256", user_id: "5 OR 1=1" }), "shh")).toBeNull();
    expect(parseSignedRequest("garbage", "shh")).toBeNull();
  });
});

describe("how a post is doing", () => {
  const last = (f: ReturnType<typeof vi.fn>) => new URL(f.mock.calls.at(-1)![0] as string);

  it("builds the full post id, and refuses anything that isn't this Page's", async () => {
    expect(fullPostId("111", "111_222")).toBe("111_222");
    expect(fullPostId("111", "222")).toBe("111_222");
    expect(fullPostId("111", "999_222")).toBeNull();
    expect(fullPostId("111", "222/insights")).toBeNull();
    const f = vi.fn(json({}));
    await expect(postEngagement(f, cfg, "111", "999_222", "tok")).rejects.toThrow(/not from this Page/);
    await expect(postInsights(f, cfg, "111", "999_222", "tok", ["post_clicks"])).rejects.toThrow(/not from this Page/);
    await expect(postInsights(f, cfg, "111", "111_222", "tok", ["post_clicks&x=1"])).rejects.toThrow(/bad metric/);
    expect(f).not.toHaveBeenCalled();
  });

  it("reads reactions, comments and shares, with zero for what Facebook leaves out", async () => {
    const f = vi.fn(json({ reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 3 } }, id: "111_222" }));
    expect(await postEngagement(f, cfg, "111", "111_222", "tok")).toEqual({ reactions: 12, comments: 3, shares: 0 });
    const url = last(f);
    expect(url.pathname).toBe("/v25.0/111_222");
    expect(url.searchParams.get("fields")).toBe("reactions.summary(true).limit(0),comments.summary(true).limit(0),shares");
    expect(url.searchParams.get("appsecret_proof")).toBe(appSecretProof("tok", "shh"));
  });

  it("finds the post of a video once Facebook has one", async () => {
    expect(await videoPostId(vi.fn(json({ post_id: "222", id: "55555" })), cfg, "111", "55555", "tok")).toBe("111_222");
    expect(await videoPostId(vi.fn(json({ id: "55555" })), cfg, "111", "55555", "tok")).toBeNull();
  });

  it("asks for lifetime insights, with the breakdown when given", async () => {
    const f = vi.fn(json({ data: [{ name: "post_media_view", period: "lifetime", values: [{ value: 640 }] }, { name: "post_clicks", period: "lifetime", values: [{ value: 21 }] }] }));
    const got = await postInsights(f, cfg, "111", "111_222", "tok", ["post_media_view", "post_clicks"]);
    expect(got.get("post_media_view")?.total).toBe(640);
    expect(got.get("post_clicks")?.total).toBe(21);
    expect(last(f).pathname).toBe("/v25.0/111_222/insights");
    expect(last(f).searchParams.get("period")).toBe("lifetime");
    expect(last(f).searchParams.has("breakdown")).toBe(false);
    await postInsights(f, cfg, "111", "111_222", "tok", ["post_media_view"], "is_from_ads");
    expect(last(f).searchParams.get("breakdown")).toBe("is_from_ads");
  });

  it("passes on Facebook's refusal, so the caller can show what it has", async () => {
    const f = vi.fn(json({ error: { message: "(#10) This endpoint requires the 'read_insights' permission", code: 10 } }, 403));
    await expect(postInsights(f, cfg, "111", "111_222", "tok", ["post_media_view"])).rejects.toBeInstanceOf(GraphError);
  });

  it("reads a breakdown in whichever shape it comes, and never guesses", () => {
    const ads = (raw: unknown) => fromAds(readInsights(raw).get("post_media_view"));
    // An object of parts as the value.
    expect(ads({ data: [{ name: "post_media_view", values: [{ value: { true: 400, false: 240 } }] }] })).toBe(400);
    // Parts one level down, under the breakdown's name.
    expect(ads({ data: [{ name: "post_media_view", values: [{ value: { is_from_ads: { "1": 400, "0": 240 } } }] }] })).toBe(400);
    // total_value with breakdowns.
    expect(ads({ data: [{ name: "post_media_view", total_value: { breakdowns: [{ dimension_keys: ["is_from_ads"], results: [{ dimension_values: ["true"], value: 400 }, { dimension_values: ["false"], value: 240 }] }] } }] })).toBe(400);
    // One entry per part.
    expect(ads({ data: [{ name: "post_media_view", breakdown_value: "true", values: [{ value: 400 }] }, { name: "post_media_view", breakdown_value: "false", values: [{ value: 240 }] }] })).toBe(400);
    // Facebook leaves out zero parts: only "not from ads" came back, so none were from ads.
    expect(ads({ data: [{ name: "post_media_view", values: [{ value: { false: 240 } }] }] })).toBe(0);
    // Nothing that says which part is which.
    expect(ads({ data: [{ name: "post_media_view", values: [{ value: 640 }] }] })).toBeNull();
    expect(ads({ data: [{ name: "post_media_view", values: [{ value: { fans: 100, others: 540 } }] }] })).toBeNull();
    expect(ads({ data: [] })).toBeNull();
    expect(ads("nonsense")).toBeNull();
    expect(readInsights({ data: [{ name: "post_clicks", values: [{ value: -4 }] }, { values: [{ value: 3 }] }] }).get("post_clicks")?.total).toBeNull();
  });
});
