import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";

// Sign-in pages aren't for search results.
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative isolate hidden flex-col justify-between overflow-hidden bg-grape-900 p-12 text-white lg:flex">
        {/* The dashboard's scene: the house, with the mascot in the corner. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static art */}
        <img src="/images/dashboard/house.webp" alt="" width={1600} height={893} className="pp-settle absolute inset-0 -z-10 size-full object-cover object-[35%_50%]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-frame-1/70 via-frame-1/55 to-frame-1/95" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized static art */}
        <img src="/images/dashboard/mascot.webp" alt="" width={641} height={720} className="absolute -bottom-2 right-8 -z-10 h-[38%] w-auto drop-shadow-[0_16px_22px_rgb(0_0_0/0.35)]" />
        <Link href="/">
          <Logo tone="dark" />
        </Link>
        <div className="pp-enter mb-auto mt-24 max-w-md space-y-5">
          <p className="font-display text-[2.4rem] leading-[1.1] font-extrabold">Find the Right Buyer for Your Property.</p>
          <p className="text-lg leading-relaxed text-white/75">
            Your AI sales assistant answers inquiries day and night, sizes up each buyer and shows you who fits each listing.
          </p>
        </div>
        <p className="text-sm text-white/60">For property owners and agents in the Philippines</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-12">
        <div className="pp-enter w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block lg:hidden">
            <Logo />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
