import { formatPeso } from "./money";
import { TYPE_LABEL } from "./property-labels";

export type CaptionListing = {
  name: string;
  type: string;
  location: string;
  price_minor: number;
  reservation_fee_minor: number | null;
  status: string;
  financing: Record<string, unknown> | null;
  description: string | null;
};

export const MAX_CAPTION = 3000;

/** A plain, factual starting caption for a Facebook post. The team edits it before posting. */
export function defaultCaption(p: CaptionListing): string {
  const f = p.financing ?? {};
  const lines: string[] = [];
  lines.push(`${p.status === "reserved" ? "Reserved" : "For sale"}: ${p.name}`);
  lines.push(`${TYPE_LABEL[p.type as keyof typeof TYPE_LABEL] ?? "Property"} in ${p.location}`);
  lines.push(`Price: ${formatPeso(p.price_minor)}`);
  if (p.reservation_fee_minor) lines.push(`Reservation fee: ${formatPeso(p.reservation_fee_minor)}`);
  const ways = [f.bankFinancing && "bank financing", f.pagIbig && "Pag-IBIG", f.inHouse && "in-house financing"].filter(Boolean);
  if (ways.length) lines.push(`Payment: ${ways.join(", ")}`);
  if (typeof f.downpaymentPercent === "number") lines.push(`Downpayment: ${f.downpaymentPercent}%`);
  const desc = (p.description ?? "").trim();
  const body = desc ? `\n\n${desc.length > 600 ? `${desc.slice(0, 600).replace(/\s+\S*$/, "")}…` : desc}` : "";
  return `${lines.join("\n")}${body}\n\nSend us a message to ask questions or book a viewing.`.slice(0, MAX_CAPTION);
}
