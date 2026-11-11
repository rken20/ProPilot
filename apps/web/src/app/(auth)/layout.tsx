import Link from "next/link";
import { Logo } from "@/components/logo";
import { Photo } from "@/components/photo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative isolate hidden flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex">
        <Photo
          name="townhouse-dining"
          widths={[720, 1200]}
          sizes="50vw"
          priority
          className="pp-settle absolute inset-0 -z-10 size-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-900/55 via-brand-900/70 to-brand-900/95" aria-hidden="true" />
        <Link href="/">
          <Logo tone="dark" />
        </Link>
        <div className="pp-enter max-w-md space-y-5">
          <p className="font-display text-[2.6rem] leading-[1.1] font-medium">Ask about the reservation fee at 11pm and get an answer from the agent&apos;s own listing.</p>
          <p className="text-lg leading-relaxed text-white/70">
            When a buyer wants to see the place, the agent gets their name, mobile number and preferred date.
          </p>
        </div>
        <p className="text-sm text-white/50">Beta, Philippines</p>
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
