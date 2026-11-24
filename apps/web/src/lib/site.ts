/**
 * The one address search engines and shared listing links should use.
 *
 * Vercel serves every deployment at several addresses, and marks all but the
 * production one "noindex" (for example the `-git-main-` address). So canonical
 * links, the sitemap and listing share links all use the production address:
 * SITE_URL if it's set, else the project's production domain on Vercel (which
 * becomes the custom domain once one is added), else APP_ORIGIN.
 */
export function siteOrigin(env: Record<string, string | undefined> = process.env): string | null {
  const clean = (v: string | undefined) => v?.trim().replace(/\/+$/, "") || null;
  const pinned = clean(env.SITE_URL);
  if (pinned && /^https?:\/\/[^/]+$/.test(pinned)) return pinned;
  const production = clean(env.VERCEL_PROJECT_PRODUCTION_URL)?.replace(/^https?:\/\//, "");
  if (production && /^[a-z0-9.-]+$/i.test(production)) return `https://${production}`;
  const app = clean(env.APP_ORIGIN);
  return app && /^https?:\/\/[^/]+$/.test(app) ? app : null;
}
