import Link from "next/link";
import { Logo } from "@/components/logo";
import { Photo } from "@/components/photo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative isolate hidden flex-col justify-between overflow-hidden bg-grape-900 p-12 text-white lg:flex">
        <Photo
          name="townhouse-dining"
          widths={[720, 1200]}
          sizes="50vw"
          priority
          className="pp-settle absolute inset-0 -z-10 size-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-grape-900/50 via-grape-800/70 to-grape-900/95" aria-hidden="true" />
        <Link href="/">
          <Logo tone="dark" />
        </Link>
        <div className="pp-enter max-w-md space-y-5">
          <p className="font-display text-[2.6rem] leading-[1.1] font-extrabold">Find the right buyer for your property.</p>
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
