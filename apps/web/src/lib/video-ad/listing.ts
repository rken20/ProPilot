import "server-only";
import { formatPeso } from "@/lib/money";
import { TYPE_LABEL } from "@/lib/property-labels";
import type { AdListing } from "./spec";

/** The columns a video ad needs from a listing. */
export const AD_COLUMNS = "id, name, type, location, price_minor, reservation_fee_minor, currency, status, description, financing";

type Row = {
  id: string;
  name: string;
  type: string;
  location: string;
  price_minor: number | string;
  reservation_fee_minor: number | string | null;
  currency: string | null;
  status: string;
  description: string | null;
  financing: unknown;
};

/** Turn a listing row into the facts a video ad may show. Everything is the owner's own entry. */
export function adListing(row: Row, business: string): AdListing {
  const f = (row.financing ?? {}) as { bankFinancing?: boolean; pagIbig?: boolean; inHouse?: boolean; downpaymentPercent?: number };
  const currency = row.currency ?? "PHP";
  return {
    name: row.name,
    typeLabel: TYPE_LABEL[row.type as keyof typeof TYPE_LABEL] ?? "Property",
    location: row.location,
    price: formatPeso(Number(row.price_minor), currency),
    priceMinor: Number(row.price_minor),
    status: row.status === "reserved" ? "reserved" : "available",
    reservationFee: row.reservation_fee_minor === null ? null : formatPeso(Number(row.reservation_fee_minor), currency),
    downpaymentPercent: typeof f.downpaymentPercent === "number" ? f.downpaymentPercent : null,
    financing: [f.bankFinancing && "Bank financing", f.pagIbig && "Pag-IBIG", f.inHouse && "In-house"].filter((x): x is string => Boolean(x)),
    description: row.description ?? "",
    business,
  };
}
