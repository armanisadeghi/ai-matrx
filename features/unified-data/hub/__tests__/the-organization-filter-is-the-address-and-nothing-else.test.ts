// features/unified-data/hub/__tests__/the-organization-filter-is-the-address-and-nothing-else.test.ts
//
// THE LAW (Arman, 2026-09-30, common-docs/policies/access-ladder.md): the data
// home's organization filter lives only in the address (`?org_filter=`), starts at All organizations
// on every visit, is never remembered and never set from the active organization.
//
// THE USE CASE: the owner of Harbor Dental Group also keeps the books for Rincon Plumbing Co. She
// narrows the home to Harbor Dental, closes the tab, and opens /data tomorrow while working in
// Rincon Plumbing: it opens on All organizations — not on yesterday's pick, and not on Rincon.
//
// RED on the DATA-HOME-2 code before the law: the pick was saved to her account
// (userPreferences.lists.dataHomeOrganizationId) and the next visit landed on it; the address word
// was `?org=`, the link that SWITCHES the active organization.
import { initializeUserPreferencesState } from "@/lib/redux/preferences/userPreferencesSlice";
import * as scope from "../dataHomeScope";

const HARBOR = "11f4e747-0000-4000-8000-000000000001";
const RINCON = "884d1ce8-0000-4000-8000-000000000002";
const LEFT = "5b0e2a11-0000-4000-8000-000000000003";
const MEMBER_OF = [HARBOR, RINCON];

describe("the organization filter is the address and nothing else", () => {
  it("a visit with no address opens on All organizations — whatever she picked before", () => {
    expect(scope.resolveDataHomeOrganization(null, MEMBER_OF)).toBe("all");
  });

  it("the resolver takes the address and her memberships, and nothing else (no saved pick, no knob, no active organization)", () => {
    expect(scope.resolveDataHomeOrganization.length).toBe(2);
  });

  it("the preferences record has no place to keep a pick", () => {
    expect("dataHomeOrganizationId" in initializeUserPreferencesState().lists).toBe(false);
  });

  it("the address names one organization she belongs to → that organization; one she left → All", () => {
    expect(scope.resolveDataHomeOrganization(HARBOR, MEMBER_OF)).toBe(HARBOR);
    expect(scope.resolveDataHomeOrganization(LEFT, MEMBER_OF)).toBe("all");
  });

  it("the address word is org_filter, never org (the link that switches the active organization)", () => {
    expect(scope.ORG_FILTER_PARAM).toBe("org_filter");
    expect(scope.dataHomeOrganizationHref("/data", new URLSearchParams("scope=mine"), HARBOR)).toBe(
      `/data?scope=mine&org_filter=${HARBOR}`,
    );
    expect(scope.dataHomeOrganizationHref("/data", new URLSearchParams(`org_filter=${HARBOR}`), "all")).toBe(
      "/data",
    );
  });
});
