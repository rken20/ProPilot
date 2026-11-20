import type { MetadataRoute } from "next";

/**
 * Lets a phone install MyHomeSeller from the browser ("Add to Home screen"):
 * its own icon, no browser bars, and it opens on the dashboard.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "MyHomeSeller",
    short_name: "MyHomeSeller",
    description: "The AI sales assistant for property owners and agents.",
    lang: "en-PH",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#3a2084",
    theme_color: "#3a2084",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/app/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/app/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add a property", url: "/app/properties/new" },
      { name: "Pipeline", url: "/app/pipeline" },
      { name: "Messages", url: "/app/inbox" },
    ],
  };
}
