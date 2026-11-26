import type { Say } from "@/lib/lang";
import Link from "next/link";
import { Card, IconTitle } from "@/components/ui";
import { formatPeso } from "@/lib/money";
import type { Match } from "@/lib/matching";

export type FitRow = { id: string; name: string; location: string; price_minor: number; asked: boolean; match: Match };

/** Your listings that fit this lead, from the property matcher. */
export function ListingsThatFit({ rows, enough, say }: { rows: FitRow[]; enough: boolean; say: Say }) {
  return (
    <Card className="p-5">
      <IconTitle icon="houses" className="text-sm font-semibold">Listings that fit</IconTitle>
      {!enough ? (
        <p className="mt-1 text-sm text-muted">{say("Add at least two of budget, area and property type above to see matching listings.", "Mag-add ng kahit dalawa sa budget, area at property type sa taas para makita ang mga bagay na listing.")}</p>
      ) : rows.length === 0 ? (
        <p className="mt-1 text-sm text-muted">{say("None of your available listings fit what they want yet.", "Wala pa sa available listings mo ang bagay sa hanap nila.")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/app/properties/${r.id}`} className="-mx-2 block rounded-lg px-2 py-2.5 hover:bg-surface">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  <span className="shrink-0 text-xs font-medium tabular-nums">{r.match.score}%</span>
                </span>
                <span className="block text-xs text-muted">
                  {formatPeso(r.price_minor)} · {r.location}
                  {r.asked ? say(" · They asked about this one", " · Ito ang tinanong nila") : ""}
                </span>
                {r.match.gaps.length ? <span className="block text-xs text-hot">{r.match.gaps.join(", ")}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
