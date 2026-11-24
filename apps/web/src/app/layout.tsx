import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/newsreader";
import "./globals.css";
import { siteOrigin } from "@/lib/site";

const origin = siteOrigin();
const DESCRIPTION =
  "MyHomeSeller is the AI sales assistant for property owners and agents in the Philippines. It answers buyers day and night, gives every listing its own public page, and shows you who fits each property.";

export const metadata: Metadata = {
  // Canonical links, the sitemap and link previews all use the production address.
  ...(origin ? { metadataBase: new URL(origin) } : {}),
  title: "MyHomeSeller: AI Sales Assistant for Property Owners and Agents",
  description: DESCRIPTION,
  applicationName: "MyHomeSeller",
  openGraph: { siteName: "MyHomeSeller", type: "website", locale: "en_PH", description: DESCRIPTION },
  // Google Search Console's ownership check: set GOOGLE_SITE_VERIFICATION in Vercel.
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
  // Installed on an iPhone's home screen: no Safari bars, and the page draws
  // under the status bar (globals.css paints that strip grape).
  appleWebApp: { capable: true, title: "MyHomeSeller", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c2563",
};

const THEME_SCRIPT = `try{if(localStorage.getItem("pp-theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;
// Chrome on Android says once, early, that the app can be installed. Keep that
// event so the "Install app" button (components/install-app) can use it later.
const INSTALL_SCRIPT = `addEventListener("beforeinstallprompt",function(e){window.__ppInstall=e;dispatchEvent(new Event("pp-install"))});addEventListener("appinstalled",function(){window.__ppInstall=null;dispatchEvent(new Event("pp-install"))})`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Apply a saved dark-mode choice before the first paint. Static text, no user input. */}
        <script dangerouslySetInnerHTML={{ __html: `${THEME_SCRIPT};${INSTALL_SCRIPT}` }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
