/**
 * The two private prices the AI negotiates with: the lowest price the owner
 * would accept, and an optional price at which the AI may close by itself.
 *
 * On plans with AI negotiation (Pro, Agency) the lowest price is required
 * (owner's decision, 27 Nov 2026): it is asked for on Add a Property, can't
 * be cleared afterwards, and any available listing without one is flagged
 * until it is set. Free and Basic never see it.
 */
import { formatPeso, pesosToCentavos } from "./money";

/** An [English, Taglish] message pair, for `say(...)`. */
export type Said = [english: string, taglish: string];

export type Floor = { minMinor: number; acceptMinor: number | null };

export type FloorCheck =
  | { ok: true; floor: Floor | null }
  | { ok: false; field: "lowestPrice" | "acceptPrice"; message: Said };

/** Checks what the owner typed against the asking price. With `required`, an empty lowest price is refused. */
export function checkFloor(
  lowestInput: string,
  acceptInput: string,
  askingMinor: number,
  required: boolean,
): FloorCheck {
  const min = pesosToCentavos(lowestInput);
  const accept = pesosToCentavos(acceptInput);
  const asking = formatPeso(askingMinor);

  if (min === null) {
    if (required)
      return {
        ok: false,
        field: "lowestPrice",
        message: [
          "Set the lowest price you'd accept. The AI needs it to negotiate, and never goes under it.",
          "I-set ang lowest price na tatanggapin mo. Kailangan ito ng AI para makipag-negotiate, at hindi ito bababa doon.",
        ],
      };
    if (accept !== null)
      return {
        ok: false,
        field: "acceptPrice",
        message: [
          "Set your lowest price first. The accept-right-away price has to be at or above it.",
          "I-set muna ang lowest price mo. Dapat kapantay o mas mataas doon ang accept-right-away price.",
        ],
      };
    return { ok: true, floor: null };
  }
  if (Number.isNaN(min) || min <= 0)
    return {
      ok: false,
      field: "lowestPrice",
      message: [
        "Enter an amount in pesos, like 4500000.",
        "Maglagay ng amount sa pesos, gaya ng 4500000.",
      ],
    };
  if (min > askingMinor)
    return {
      ok: false,
      field: "lowestPrice",
      message: [
        `It can't be above the asking price (${asking}).`,
        `Hindi pwedeng mas mataas sa asking price (${asking}).`,
      ],
    };

  if (accept === null)
    return { ok: true, floor: { minMinor: min, acceptMinor: null } };
  if (Number.isNaN(accept) || accept <= 0)
    return {
      ok: false,
      field: "acceptPrice",
      message: [
        "Enter the accept-right-away price in pesos, like 4800000.",
        "Ilagay ang accept-right-away price sa pesos, gaya ng 4800000.",
      ],
    };
  if (accept < min)
    return {
      ok: false,
      field: "acceptPrice",
      message: [
        "The accept-right-away price can't be under your lowest price.",
        "Hindi pwedeng mas mababa sa lowest price mo ang accept-right-away price.",
      ],
    };
  if (accept > askingMinor)
    return {
      ok: false,
      field: "acceptPrice",
      message: [
        `The accept-right-away price can't be above the asking price (${asking}).`,
        `Hindi pwedeng mas mataas sa asking price (${asking}) ang accept-right-away price.`,
      ],
    };
  return { ok: true, floor: { minMinor: min, acceptMinor: accept } };
}

export type FloorProblem = "missing" | "above-asking";

/**
 * What needs the owner's attention on one listing, on a plan with AI
 * negotiation: no lowest price yet, or one left above an asking price that
 * was lowered since. Only listings that are for sale need one.
 */
export function floorProblem(
  status: string,
  minMinor: number | null,
  askingMinor: number,
): FloorProblem | null {
  if (status !== "available") return null;
  if (minMinor === null) return "missing";
  if (minMinor > askingMinor) return "above-asking";
  return null;
}
