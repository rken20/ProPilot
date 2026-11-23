import Link from "next/link";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { formatPeso } from "@/lib/money";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/property-labels";

export type PropertyRow = {
  id: string;
  name: string;
  type: string;
  location: string;
  price_minor: number;
  currency: string;
  status: string;
  is_public: boolean;
  /** Cover photo address, if the listing has photos. */
  coverUrl: string | null;
};

function Thumb({ url, className }: { url: string | null; className: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- pre-sized thumbnail
    <img src={url} alt="" className={`${className} shrink-0 object-cover`} />
  ) : (
    <span className={`${className} grid shrink-0 place-items-center bg-brand-50 text-brand-600`}>
      <Building2 className="size-5" aria-hidden />
    </span>
  );
}

function Status({ status }: { status: string }) {
  return <Badge tone={status === "available" ? "brand" : "neutral"}>{STATUS_LABEL[status as keyof typeof STATUS_LABEL]}</Badge>;
}

/** The properties list: tappable cards on phones, a table from tablet size up. */
export function PropertiesList({ rows }: { rows: PropertyRow[] }) {
  return (
    <>
      <ul className="space-y-3 sm:hidden">
        {rows.map((p) => (
          <li key={p.id}>
            <Link
              href={`/app/properties/${p.id}`}
              className="flex gap-3 rounded-[1.25rem] border border-line bg-white p-3 shadow-[var(--shadow-card)] transition-colors active:bg-zinc-50"
            >
              <Thumb url={p.coverUrl} className="size-20 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-semibold leading-snug text-ink">{p.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{p.location}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="text-base font-extrabold tabular-nums text-ink">{formatPeso(p.price_minor, p.currency)}</p>
                  <Status status={p.status} />
                </div>
                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                  <span>{TYPE_LABEL[p.type as keyof typeof TYPE_LABEL]}</span>
                  {p.is_public ? <span className="font-medium text-brand-600">Public page</span> : null}
                  {p.coverUrl ? null : <span className="text-amber-700">No photos</span>}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-[1.5rem] border border-line bg-white shadow-[var(--shadow-card)] sm:block">
        <table className="pp-table w-full text-sm">
          <thead className="text-left text-xs">
            <tr>
              <th className="px-4 py-3 font-medium">Property</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Type</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Thumb url={p.coverUrl} className="size-12 rounded-lg" />
                    <div className="min-w-0">
                      <Link href={`/app/properties/${p.id}`} className="font-medium text-zinc-900 hover:text-brand-700">
                        {p.name}
                      </Link>
                      <p className="text-xs text-zinc-500">
                        {p.location}
                        {p.is_public ? <span className="ml-2 font-medium text-brand-600">Public page</span> : null}
                        {p.coverUrl ? null : <span className="ml-2 text-amber-700">No photos</span>}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-zinc-600 md:table-cell">{TYPE_LABEL[p.type as keyof typeof TYPE_LABEL]}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">{formatPeso(p.price_minor, p.currency)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <Status status={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
