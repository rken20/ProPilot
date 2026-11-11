import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-brand-900 p-12 text-white lg:flex">
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
