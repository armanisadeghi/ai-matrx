/**
 * THE EMPTY GROUP READS AS A STATE (lane DRILL-LIVE-FIX-2 #5; live verifier on release 13e0b6fafe): by
 * conversation, the group with no conversation read "None" and its Duration "719h 59m" — first-to-last
 * across unrelated rows. A span Measure on the empty group reads "—" (null), and a relation's empty group
 * reads "No <dimension>". Red on HEAD: the span kept its number and the label was "None".
 */
jest.mock("@/components/cost/pointsRate", () => ({ currentPointsRate: () => 20000 }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

import { drillDimensionLabelFor } from "../dimensionWords";
import { drillRowOf } from "../useDrillExplorer";

describe("the empty group", () => {
  const spans = new Set(["duration"]);
  it("a span Measure on the empty group is no number; on a named group, and on the total, it is", () => {
    const empty = drillRowOf({ kind: "group", groups: { conversation: null }, measures: { cost: 3, duration: 2_591_940 }, row_count: 9 } as never, undefined, spans);
    expect(empty.measures).toEqual({ cost: 3, duration: null });
    const named = drillRowOf({ kind: "group", groups: { conversation: "c1" }, measures: { cost: 1, duration: 60 }, row_count: 1 } as never, undefined, spans);
    expect(named.measures.duration).toBe(60);
    const total = drillRowOf({ kind: "total", groups: {}, measures: { duration: 100 }, row_count: 10 } as never, undefined, spans);
    expect(total.measures.duration).toBe(100);
  });
  it("a relation's empty group reads 'No conversation', never 'None'", () => {
    const say = drillDimensionLabelFor({ key: "conversation", label: "Conversation", from: "conversation_id", kind: "relation" } as never, { names: {} })!;
    expect(say(null)).toBe("No conversation");
  });
});
