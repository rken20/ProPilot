import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Nearly every screen is per-user and reads the session cookie, so we render
  // on request rather than using Cache Components' static shells.
  cacheComponents: false,
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
