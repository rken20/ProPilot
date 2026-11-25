import { sayIn } from "@/lib/lang";
import { LangProvider } from "@/components/lang";
import { siteLang } from "@/lib/lang-server";
import type { Metadata } from "next";
import Link from "next/link";
import { EllipsisVertical, MonitorDown, Share } from "lucide-react";
import type { ReactNode } from "react";
import { Icon3d, type Icon3dName } from "@/components/icon-3d";
import { InstallHere } from "@/components/install-app";
import { Logo } from "@/components/logo";
import { buttonClass, cx } from "@/components/ui";
import { getOrigin } from "@/lib/auth";
import { qrPath } from "@/lib/qr";

export const metadata: Metadata = {
  title: "Get the app · MyHomeSeller",
  description: "Install MyHomeSeller on your phone or computer. No app store needed.",
  alternates: { canonical: "/get-app" },
};

const icon = "inline size-4 align-[-3px]";

/** How to install MyHomeSeller on a phone or computer. Public, so it can be shared and scanned. */
export default async function GetAppPage() {
  const lang = await siteLang();
  const say = sayIn(lang);
  const url = `${await getOrigin()}/get-app`;
  const qr = qrPath(url);
  return (
    <div className="min-h-svh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" aria-label="MyHomeSeller home">
          <Logo />
        </Link>
        <Link href="/app" className={buttonClass("ghost", "min-h-11")}>
          Open MyHomeSeller
        </Link>
      </header>

      <LangProvider lang={lang}>
      <main className="mx-auto max-w-5xl px-5 pb-20 sm:px-8">
        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-frame-1 via-frame-2 to-frame-3 p-6 text-white shadow-[var(--shadow-lift)] sm:p-10">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-xl">
              <h1 className="text-[2rem] leading-[1.1] font-extrabold tracking-tight text-balance sm:text-[2.6rem]">Get the MyHomeSeller app</h1>
              <p className="mt-3 text-[15px] text-white/80">
                {say("Install it on your phone or computer straight from the browser. It gets its own icon, opens full screen and updates by itself. No app store needed.", "I-install ito sa phone o computer mo mula mismo sa browser. May sarili itong icon, full screen kapag binuksan, at kusang nag-a-update. Hindi kailangan ng app store.")}
              </p>
              <div className="mt-6">
                <InstallHere />
              </div>
            </div>
            <Icon3d name="phone" size={128} className="max-sm:hidden" />
          </div>
        </section>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Device icon="phone" tile="bg-tile-mint" name="Android">
            <li>{say("Open this page in Chrome.", "Buksan ang page na ito sa Chrome.")}</li>
            <li>
              Tap the menu <EllipsisVertical className={`${icon} -mx-1`} aria-hidden />, then <b>Install app</b> or <b>Add to Home screen</b>.
            </li>
            <li>
              Tap <b>Install</b>. MyHomeSeller appears with your other apps.
            </li>
          </Device>
          <Device icon="phone" tile="bg-tile-sky" name="iPhone and iPad">
            <li>{say("Open this page in Safari.", "Buksan ang page na ito sa Safari.")}</li>
            <li>
              Tap Share <Share className={icon} aria-hidden />, then <b>Add to Home Screen</b>.
            </li>
            <li>
              Tap <b>Add</b>. MyHomeSeller appears on your home screen.
            </li>
          </Device>
          <Device icon="laptop" tile="bg-tile-peach" name="Computer">
            <li>{say("Open this page in Chrome or Edge.", "Buksan ang page na ito sa Chrome o Edge.")}</li>
            <li>
              Click the install icon <MonitorDown className={icon} aria-hidden /> at the end of the address bar.
            </li>
            <li>
              Click <b>Install</b>. MyHomeSeller opens in its own window.
            </li>
          </Device>
        </div>

        {/* Reading this on a computer: the quickest way to get this page onto the phone. */}
        <section className="mt-5 flex items-center gap-6 rounded-[1.5rem] border border-line bg-white p-6 shadow-[var(--shadow-card)] max-md:hidden">
          <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className="size-36 shrink-0 rounded-xl bg-[#fff]" role="img" aria-label="QR code that opens this page">
            <path d={qr.path} fill="#0f1b3d" />
          </svg>
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{say("On a computer? Scan to open this page on your phone", "Nasa computer ka? I-scan para mabuksan ang page na ito sa phone mo")}</h2>
            <p className="mt-1 text-sm text-muted">{say("Point your phone's camera at the code, tap the link, then follow the steps for your phone.", "Itutok ang camera ng phone mo sa code, i-tap ang link, tapos sundan ang steps para sa phone mo.")}</p>
            <p className="mt-3 truncate font-mono text-sm text-ink">{url}</p>
          </div>
        </section>
      </main>
      </LangProvider>
    </div>
  );
}

function Device({ icon, tile, name, children }: { icon: Icon3dName; tile: string; name: string; children: ReactNode }) {
  return (
    <section className={cx("rounded-[1.5rem] p-6", tile)}>
      <Icon3d name={icon} size={44} />
      <h2 className="mt-3 text-lg font-bold">{name}</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink/85 marker:font-bold">{children}</ol>
    </section>
  );
}
