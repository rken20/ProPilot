"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Card, buttonClass } from "@/components/ui";
import { Icon3d } from "@/components/icon-3d";

/** The listing's public link, ready to copy or post. */
export function ShareListing({ url, views, inquiries }: { url: string; views: number; inquiries: number }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the field is selectable.
    }
  };
  return (
    <Card className="mb-6 bg-gradient-to-br from-tile-lavender to-tile-sky">
      <div className="flex flex-wrap items-start gap-4">
        <Icon3d name="link" size={48} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold tracking-tight">Share this listing</h2>
          <p className="mt-0.5 text-sm text-muted">
            Its public page: {views.toLocaleString()} view{views === 1 ? "" : "s"} and {inquiries} inquir{inquiries === 1 ? "y" : "ies"} in the last 30 days. Inquiries land on your
            Leads page.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={url}
              aria-label="Public link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 basis-64 rounded-xl border border-line bg-white px-3 py-2 text-sm"
            />
            <button type="button" onClick={copy} className={buttonClass("primary")}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy link"}
            </button>
            <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
              Share on Facebook
            </a>
            <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost")}>
              <ExternalLink className="size-4" aria-hidden /> Open
            </a>
          </div>
        </div>
      </div>
    </Card>
  );
}
