import Link from "next/link";
import { Sparkles } from "lucide-react";

/** Shown in place of a buyer AI feature when the buyer is on Free. */
export function BuyerUpgradeNote({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-brand-50/60 p-4 text-sm">
      <Sparkles className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-muted">{children}</p>
        <Link href="/buyer/plan" className="mt-2 inline-block font-semibold text-brand-700 hover:underline">
          See Basic, ₱499 a month
        </Link>
      </div>
    </div>
  );
}
