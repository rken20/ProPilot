import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-brand-900 p-12 text-brand-50 lg:flex">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          PropPilot AI
        </Link>
        <div className="max-w-md space-y-4">
          <p className="text-3xl font-semibold leading-tight">Every inquiry answered. Every hot lead on your phone.</p>
          <p className="text-brand-100/80">
            Your AI assistant answers Messenger questions from your own listings, qualifies buyers, and hands you the
            ones ready to view.
          </p>
        </div>
        <p className="text-sm text-brand-100/60">Beta · Philippines</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
