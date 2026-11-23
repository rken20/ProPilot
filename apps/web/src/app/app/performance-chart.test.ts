import { describe, expect, it } from "vitest";
import { spreadLabels } from "./performance-chart";

describe("end-of-line labels on the chart", () => {
  it("stay where they are when they don't touch", () => {
    expect(spreadLabels([10, 50, 90], 14)).toEqual([10, 50, 90]);
  });

  it("are pushed apart when lines end close together, keeping their order", () => {
    // Inquiries and viewings both end near the bottom.
    expect(spreadLabels([13, 88, 98], 14)).toEqual([13, 86, 100]);
    expect(spreadLabels([100, 100, 100], 14)).toEqual([72, 86, 100]);
    expect(spreadLabels([98, 13, 88], 14)).toEqual([100, 13, 86]);
    // The lowest label keeps clear of the dates under the chart.
    expect(spreadLabels([13, 88, 98], 14, 94)).toEqual([13, 80, 94]);
  });
});
