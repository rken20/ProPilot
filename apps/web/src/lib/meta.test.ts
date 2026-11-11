import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  appSecretProof,
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
  type MetaConfig,
} from "./meta";

const cfg: MetaConfig = { appId: "123", appSecret: "shh", version: "v25.0", scopes: ["pages_show_list"] };
const json = (body: unknown, status = 200) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("metaConfig", () => {
  it("needs a numeric app id and a secret, and ignores bad optional values", () => {
    expect(metaConfig({ META_APP_ID: "abc", META_APP_SECRET: "x" })).toBeNull();
    const c = metaConfig({ META_APP_ID: "123", META_APP_SECRET: "x", META_GRAPH_VERSION: "latest", META_EXTRA_SCOPES: "business_management, bad scope!" });
    expect(c?.version).toBe("v25.0");
    expect(c?.scopes).toEqual(["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management"]);
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
