import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-brand-900 p-12 text-white lg:flex">
        <Link href="/">
          <Logo />
        </Link>
        <div className="max-w-md space-y-4">
          <p className="text-3xl font-bold leading-tight tracking-tight">Where buyers and agents meet, with an AI that never sleeps.</p>
          <p className="text-white/70">
            Buyers get straight answers about price, financing and availability. Agents get every inquiry answered and
            the serious buyers sent their way.
          </p>
        </div>
        <p className="text-sm text-white/50">Beta, Philippines</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block lg:hidden">
            <Logo />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
