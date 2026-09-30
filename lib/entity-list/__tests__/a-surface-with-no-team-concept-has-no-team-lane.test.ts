// A lane that can never hold anything is absent, not an empty tab (a screen never lies).
// A surface DECLARES the lanes its type cannot hold (`lanes: { team: false }`, `{ public: false }`);
// the shell does not check who is looking, and a lane that is merely empty for this person stays.
import { withStandardLanes } from "@/lib/list-scope/types";
import { mandateListConfig } from "@/features/mandates/browse/listConfig";
import { crossSiteRankListConfig } from "@/features/marketing/components/ranks/cross-site-list-config";
import { CRM_LANES, CRM_LIST_SCOPES } from "@/features/crm/types";

describe("the lanes a surface offers are a declared fact of its type", () => {
  it("adds My team beside My Orgs by default", () => {
    expect(withStandardLanes(["orgs", "system"])).toEqual(["all", "team", "orgs", "system"]);
  });

  it("drops a declared-absent team lane and keeps All", () => {
    expect(withStandardLanes(["orgs", "shared", "public", "system"], { lanes: { team: false } })).toEqual([
      "all",
      "orgs",
      "shared",
      "public",
      "system",
    ]);
    expect(withStandardLanes(["mine", "team", "orgs"], { lanes: { team: false } })).not.toContain("team");
  });

  it("drops any declared-absent lane, not only team", () => {
    expect(withStandardLanes(["mine", "orgs", "shared", "public"], { lanes: { public: false } })).toEqual([
      "all",
      "mine",
      "team",
      "orgs",
      "shared",
    ]);
    expect(withStandardLanes(["mine", "orgs", "system"], { lanes: { system: false, team: false } })).toEqual([
      "all",
      "mine",
      "orgs",
    ]);
  });

  it("keeps a possible-but-empty lane: only a declaration removes one", () => {
    expect(withStandardLanes(["mine", "orgs", "shared", "public"], { lanes: {} })).toContain("public");
    expect(withStandardLanes(["mine", "orgs", "shared", "public"])).toContain("public");
  });

  it("mandates are homed to organizations and have no team", () => {
    expect(mandateListConfig.lanes).toEqual({ team: false });
    expect(withStandardLanes(mandateListConfig.scopes, { lanes: mandateListConfig.lanes })).not.toContain("team");
  });

  it("tracked keywords and CRM parties have no publish path, so no Public lane", () => {
    expect(crossSiteRankListConfig.lanes).toEqual({ public: false });
    expect(
      withStandardLanes(crossSiteRankListConfig.scopes, { lanes: crossSiteRankListConfig.lanes }),
    ).not.toContain("public");
    expect(withStandardLanes(CRM_LIST_SCOPES, { lanes: CRM_LANES })).not.toContain("public");
  });
});
