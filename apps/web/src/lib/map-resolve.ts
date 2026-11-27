import "server-only";
import { isFullMapLink, isShortMapLink, pinFromMapLink } from "@/lib/map";

/**
 * Follow a Google Maps short link (maps.app.goo.gl) to the full link it
 * stands for, and read the pin from that. The server only ever requests
 * Google's two short-link hosts, never an address taken from a redirect that
 * isn't one of them, and it reads headers only.
 */
export async function pinFromShortLink(
  url: URL,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  let next = url;
  for (let hop = 0; hop < 4; hop++) {
    if (!isShortMapLink(next)) return null;
    let res: Response;
    try {
      res = await fetchImpl(next.href, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(4000),
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; MyHomeSeller map pin)",
        },
      });
    } catch {
      return null;
    }
    const to = res.headers.get("location");
    await res.body?.cancel().catch(() => undefined);
    if (res.status < 300 || res.status >= 400 || !to) return null;
    let target: URL;
    try {
      target = new URL(to, next);
    } catch {
      return null;
    }
    if (isFullMapLink(target)) return pinFromMapLink(target);
    next = target;
  }
  return null;
}
