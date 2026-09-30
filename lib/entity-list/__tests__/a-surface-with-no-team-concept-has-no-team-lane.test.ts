// A lane that can never hold anything is absent, not an empty tab (a screen never lies).
// A surface DECLARES "no team concept" (`teamLane: false`); the shell does not check who it is.
import { withStandardLanes } from "@/lib/list-scope/types";
import { mandateListConfig } from "@/features/mandates/browse/listConfig";

describe("the My team lane is a declared fact of the surface", () => {
  it("is added beside My Orgs by default", () => {
    expect(withStandardLanes(["orgs", "system"])).toEqual(["all", "team", "orgs", "system"]);
  });

  it("is absent when the surface declares teamLane: false, and All stays", () => {
    expect(withStandardLanes(["orgs", "shared", "public", "system"], { teamLane: false })).toEqual([
      "all",
      "orgs",
      "shared",
      "public",
      "system",
    ]);
    expect(withStandardLanes(["mine", "team", "orgs"], { teamLane: false })).not.toContain("team");
  });

  it("is declared for mandates, which are homed to organizations and have no team", () => {
    expect(mandateListConfig.teamLane).toBe(false);
    expect(withStandardLanes(mandateListConfig.scopes, { teamLane: mandateListConfig.teamLane })).not.toContain("team");
  });
});
