/**
 * A FEATURE CODE NEVER REACHES A PERSON (lane DRILL-CLOSE, VERIFY-DRILL-FINAL "raw feature codes in
 * names"). Production read "mandate:news.coarse_relevance" in Findings and "Sch run" in the executions
 * table's Feature column.
 *   - the names door's `feature` part names a mandate by the mandate's own declared label; a code it
 *     does not name (or a door without that part) reads in plain words, never the raw code;
 *   - a code the definition declares as a choice ("sch_run" → "Scheduled run") reads as that choice even
 *     when the Dimension also has a names resolver.
 * Red on HEAD: `feature` was not a named Dimension (no resolver), and a resolver's name beat the
 * definition's declared choice.
 */
const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) } }));

import { drillDimensionLabelFor } from "@/components/official/drill-explorer/dimensionWords";
import { usageNameResolvers } from "../useUsageDrill";

const ORG = "00000000-0000-0000-0000-000000000000";

describe("the usage feature reads in its registry's words", () => {
  it("is a named Dimension: the door's feature part, else plain words", async () => {
    const feature = usageNameResolvers(ORG).feature;
    expect(feature).toBeDefined();
    rpc.mockResolvedValueOnce({ data: { feature: { "mandate:news.coarse_relevance": "News relevance check" } }, error: null });
    const got = await feature!.resolve(["mandate:news.coarse_relevance", "lane_e_live"]);
    expect(got).toEqual({ ok: true, names: { "mandate:news.coarse_relevance": "News relevance check", lane_e_live: "Lane e live" } });
    expect(rpc).toHaveBeenLastCalledWith("ai_usage_names", expect.objectContaining({ p_ids: expect.objectContaining({ feature: ["mandate:news.coarse_relevance", "lane_e_live"] }) }));
  });
  it("a door without the feature part, or a failed read, still never shows the code", async () => {
    const feature = usageNameResolvers(ORG).feature!;
    rpc.mockResolvedValueOnce({ data: { counted_through: null }, error: null });
    expect(await feature.resolve(["mandate:news.coarse_relevance"])).toEqual({ ok: true, names: { "mandate:news.coarse_relevance": "Mandate · news coarse relevance" } });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
    expect(await feature.resolve(["sch_run"])).toEqual({ ok: true, names: { sch_run: "Sch run" } });
  });
});

describe("a declared choice is the code's words, before any host name", () => {
  it("sch_run reads Scheduled run even when the names book holds plain words for it", () => {
    const label = drillDimensionLabelFor(
      { key: "feature", label: "Feature", from: "feature", kind: "choice", choices: [{ value: "sch_run", label: "Scheduled run" }] } as never,
      { names: { sch_run: "Sch run", "mandate:news.coarse_relevance": "News relevance check" }, resolver: usageNameResolvers(ORG).feature },
    )!;
    expect(label("sch_run")).toBe("Scheduled run");
    expect(label("mandate:news.coarse_relevance")).toBe("News relevance check");
  });
});
