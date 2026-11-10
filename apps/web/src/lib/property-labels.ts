import type { PROPERTY_STATUSES, PROPERTY_TYPES } from "@proppilot/shared";

/** Display labels. Kept out of client components so server pages can import the real values. */
export const TYPE_LABEL: Record<(typeof PROPERTY_TYPES)[number], string> = {
  condominium: "Condominium",
  house_and_lot: "House and lot",
  townhouse: "Townhouse",
  lot: "Lot only",
  commercial: "Commercial",
  other: "Other",
};

export const STATUS_LABEL: Record<(typeof PROPERTY_STATUSES)[number], string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
  archived: "Archived",
};
