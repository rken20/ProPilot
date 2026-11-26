import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";

// Read the address when asked, so a new domain shows up without a rebuild.
export const dynamic = "force-dynamic";

/** Search engines may read the public pages and listings; the signed-in app is off limits. */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/l/", "/properties"],
      // The sign-in pages aren't listed here: they carry a "noindex" tag, which a crawler has to be allowed to read.
      disallow: ["/app/", "/admin/", "/api/", "/auth/", "/alerts/", "/invite/", "/onboarding", "/start"],
    },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
