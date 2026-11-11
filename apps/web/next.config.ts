import type { NextConfig } from "next";

const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
const dev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy. Scripts and styles allow 'unsafe-inline' because the
 * App Router injects inline bootstrap scripts; everything else is limited to
 * this site, Supabase (photos, auth, uploads) and Vercel's preview toolbar.
 * form-action includes Supabase and Google because "Continue with Google"
 * submits a form that redirects there.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://vercel.live`,
  "style-src 'self' 'unsafe-inline'",
  // fbcdn: previews of the business's own Facebook Page posts on Add property.
  `img-src 'self' data: blob: ${supabase} https://*.fbcdn.net`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabase.replace(/^https/, "wss")} https://vercel.live${dev ? " ws:" : ""}`,
  "frame-src https://vercel.live",
  "frame-ancestors 'none'",
  `form-action 'self' ${supabase} https://accounts.google.com`,
  "base-uri 'self'",
  "object-src 'none'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
]
  .join("; ")
  .replace(/\s+;/g, ";");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Nearly every screen is per-user and reads the session cookie, so we render
  // on request rather than using Cache Components' static shells.
  cacheComponents: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
