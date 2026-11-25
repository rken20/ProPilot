"use client";

import { useSay } from "@/components/lang";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { EllipsisVertical, Share, X } from "lucide-react";
import { Icon3d } from "@/components/icon-3d";
import { buttonClass, cx } from "@/components/ui";

/** Chrome's "this site can be installed" event. The root layout keeps it on window until it's needed. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type InstallWindow = Window & { __ppInstall?: InstallEvent | null };

const DISMISSED = "pp-install-hidden";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** "installed" when opened from the home-screen icon; otherwise which steps to show. */
function platform(): "installed" | "ios" | "other" {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  const ua = navigator.userAgent;
  // iPads report themselves as Macs; a Mac has no touch screen.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1) ? "ios" : "other";
}

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
}

function useInstall() {
  const where = useSyncExternalStore(subscribe, platform, () => null);
  const [event, setEvent] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const read = () => setEvent((window as InstallWindow).__ppInstall ?? null);
    read();
    window.addEventListener("pp-install", read);
    return () => window.removeEventListener("pp-install", read);
  }, []);

  async function install() {
    if (!event) return;
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      // The browser already showed its own prompt; the written steps still work.
    }
    (window as InstallWindow).__ppInstall = null;
    setEvent(null);
  }
  return { where, canPrompt: event !== null, install };
}

function IosSteps() {
  const say = useSay();
  return (
    <>
      {say("In Safari, tap", "Sa Safari, i-tap ang")} <Share className="mx-0.5 inline size-4 align-[-3px]" aria-label="Share" />
      {say(", then", ", tapos")}{" "}
      <span className="font-semibold text-ink">Add to Home Screen</span>.
    </>
  );
}

function AndroidSteps() {
  const say = useSay();
  return (
    <>
      {say("In Chrome, tap", "Sa Chrome, i-tap ang")} <EllipsisVertical className="-mx-1 inline size-4 align-[-3px]" aria-label={say("the menu", "menu")} />
      {say(", then", ", tapos")}{" "}
      <span className="font-semibold text-ink">Install app</span> {say("or", "o")} <span className="font-semibold text-ink">Add to Home screen</span>.
    </>
  );
}

/** A dismissible nudge on the dashboard until the app is installed. */
export function InstallBanner() {
  const { where, canPrompt, install } = useInstall();
  const dismissed = useSyncExternalStore(
    () => () => {},
    wasDismissed,
    () => true,
  );
  const [hidden, setHidden] = useState(false);
  const say = useSay();
  if (!where || where === "installed" || dismissed || hidden) return null;

  function hide() {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Private windows may block storage; it stays hidden for this visit.
    }
    setHidden(true);
  }

  return (
    <section aria-label="Get the app" className="relative flex items-start gap-3 rounded-[1.5rem] bg-tile-lavender p-4 pr-11 lg:items-center lg:pl-5 lg:pr-14">
      <Icon3d name="phone" size={40} className="shrink-0" />
      <div className="min-w-0 lg:flex lg:flex-1 lg:items-center lg:justify-between lg:gap-4">
        <div>
          <p className="font-bold">Get the MyHomeSeller app</p>
          <p className="mt-0.5 text-sm text-muted">
            {canPrompt ? (
              say("One tap to open, full screen. No app store needed.", "Isang tap lang para buksan, full screen. Hindi kailangan ng app store.")
            ) : (
              <>
                <span className="lg:hidden">{where === "ios" ? <IosSteps /> : <AndroidSteps />}</span>
                <span className="max-lg:hidden">{say("Install it on your phone or computer. No app store needed.", "I-install sa phone o computer mo. Hindi kailangan ng app store.")}</span>
              </>
            )}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 lg:mt-0 lg:shrink-0">
          {canPrompt ? (
            <button type="button" onClick={install} className={buttonClass("primary")}>
              Install app
            </button>
          ) : null}
          <Link href="/get-app" className={buttonClass("secondary")}>
            {canPrompt ? "Other devices" : "How to install"}
          </Link>
        </div>
      </div>
      <button type="button" onClick={hide} aria-label="Hide" className="absolute right-2 top-2 grid size-9 place-items-center rounded-full text-muted hover:bg-white/60 hover:text-ink">
        <X className="size-4" aria-hidden />
      </button>
    </section>
  );
}

/** The install button on the Get the app page (on the grape panel). */
export function InstallHere() {
  const say = useSay();
  const { where, canPrompt, install } = useInstall();
  if (where === "installed") {
    return <p className="rounded-full bg-white/15 px-4 py-2.5 text-sm font-semibold">{say("You're using the installed app. It updates by itself.", "Installed app na ang gamit mo. Kusa itong nag-a-update.")}</p>;
  }
  if (canPrompt) {
    return (
      <button type="button" onClick={install} className={buttonClass("inverse", "min-h-12 px-7 text-[15px]")}>
        Install on this device
      </button>
    );
  }
  return <p className="text-sm text-white/75">{say("Follow the steps for your device below. It takes about 10 seconds.", "Sundan ang steps para sa device mo sa baba. Mga 10 segundo lang ito.")}</p>;
}

/** The same help, always available on the Account page. */
export function InstallCard({ className }: { className?: string }) {
  const say = useSay();
  const { where, canPrompt, install } = useInstall();
  return (
    <div className={cx("rounded-[1.5rem] border border-line bg-white p-6 shadow-[var(--shadow-card)]", className)}>
      <div className="flex items-start gap-3">
        <Icon3d name="phone" size={40} className="shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">MyHomeSeller on your phone</p>
          {where === "installed" ? (
            <p className="mt-1 text-sm text-muted">{say("You're using the installed app. It updates by itself.", "Installed app na ang gamit mo. Kusa itong nag-a-update.")}</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">{say("Add it to your home screen: its own icon, full screen, no app store needed.", "I-add ito sa home screen mo: may sariling icon, full screen, hindi kailangan ng app store.")}</p>
              {canPrompt ? (
                <button type="button" onClick={install} className={buttonClass("primary", "mt-3")}>
                  Install app
                </button>
              ) : null}
              <ul className="mt-3 space-y-1.5 text-sm text-muted">
                {where !== "ios" ? (
                  <li>
                    <span className="font-semibold text-ink">Android:</span> <AndroidSteps />
                  </li>
                ) : null}
                {where !== "other" || !canPrompt ? (
                  <li>
                    <span className="font-semibold text-ink">iPhone:</span> <IosSteps />
                  </li>
                ) : null}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
