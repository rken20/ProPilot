/**
 * The app admin's Reports screen: the shapes it shows and the small rules that
 * don't need the database.
 */

export type Report = {
  id: string;
  source: "visitor" | "auto";
  reason: string;
  details: string | null;
  /** From the visitor, if they left one. Erased when the report is closed. */
  contact: string | null;
  created_at: string;
};

export type ReportedListing = {
  id: string;
  name: string;
  location: string;
  price_minor: number;
  currency: string;
  /** It still has a public page a buyer can open. */
  live: boolean;
  seller: string;
  verified: boolean;
  capacity: string | null;
  license: string | null;
  reports: Report[];
};

export type TakenDown = {
  id: string;
  name: string;
  seller: string;
  reason: string;
  at: string;
};

type Row = Report & { listing: Omit<ReportedListing, "reports"> };

/** One card per listing, the listing with the newest report first, each listing's reports newest first. */
export function groupReports(rows: Row[]): ReportedListing[] {
  const sorted = [...rows].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const byListing = new Map<string, ReportedListing>();
  for (const { listing, ...report } of sorted) {
    if (!byListing.has(listing.id))
      byListing.set(listing.id, { ...listing, reports: [] });
    byListing.get(listing.id)!.reports.push(report);
  }
  return [...byListing.values()];
}

export const REPORT_NOTICES: Record<
  string,
  { tone: "success" | "error"; text: string }
> = {
  "taken-down": {
    tone: "success",
    text: "Listing taken off public pages. Its open reports are closed, and the seller was told why.",
  },
  dismissed: { tone: "success", text: "Report closed. The listing stays up." },
  restored: { tone: "success", text: "Listing is back on public pages." },
  "need-reason": {
    tone: "error",
    text: "Say why the listing is taken down. The seller sees this reason.",
  },
  failed: {
    tone: "error",
    text: "That didn't go through. Reload the page and try again.",
  },
};
