import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/newsreader";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyHomeSeller",
  description: "The AI sales assistant for property owners and agents.",
  applicationName: "MyHomeSeller",
  // Installed on an iPhone's home screen: no Safari bars, and the page draws
  // under the status bar (globals.css paints that strip grape).
  appleWebApp: { capable: true, title: "MyHomeSeller", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#3a2084",
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
