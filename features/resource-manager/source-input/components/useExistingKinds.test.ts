/**
 * Use existing offers exactly the kinds in the Resources grid's "Sources" and
 * "Sources & Outputs" roles — never Utilities, Outputs or Workspaces
 * (Arman, 2026-09-30: "We want sources… Just a list of the things that are in
 * either sources or sources and outputs").
 */
import { offeredKinds, SOURCE_ROLES } from "./UseExisting";
import { curatedTokens, listableTokens, tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";

describe("Use existing kinds", () => {
  it("offers every readable kind whose role is Sources or Sources & Outputs, and nothing else", () => {
    const offered = offeredKinds();
    const pickable = new Set<string>(listableTokens());
    const expected = (curatedTokens() as string[]).filter(
      (t) => pickable.has(t) && (SOURCE_ROLES as readonly string[]).includes(tryGetEntityInfo(t)?.contentRole ?? ""),
    );
    expect(offered).toEqual(expected);
    expect(offered.length).toBeGreaterThan(6);
    for (const t of offered) {
      expect(["source", "hybrid"]).toContain(tryGetEntityInfo(t)?.contentRole);
    }
    for (const t of ["file", "note"]) expect(offered).toContain(t);
  });
});
