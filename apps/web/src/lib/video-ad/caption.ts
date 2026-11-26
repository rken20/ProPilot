/**
 * The words posted with a video ad on a Facebook Page. They are the ad's own
 * words and the listing's own facts, so the post says nothing the video and the
 * listing don't. The owner sees it before they press Post.
 */
import { shortPlace, termsOf, type AdListing, type AdText } from "./spec";

export const MAX_VIDEO_CAPTION = 1500;

/** `link` is the listing's public page, when it has one. */
export function videoCaption(
  text: AdText,
  l: AdListing,
  link: string | null,
): string {
  const parts = [
    text.hook,
    text.lines.map((line) => `• ${line}`).join("\n"),
    [
      `${l.price}${l.status === "reserved" ? " (reserved)" : ""}`,
      shortPlace(l.location),
      ...termsOf(l),
    ].join(" · "),
    [text.cta, link].filter(Boolean).join("\n"),
  ];
  return parts.filter(Boolean).join("\n\n").slice(0, MAX_VIDEO_CAPTION);
}
