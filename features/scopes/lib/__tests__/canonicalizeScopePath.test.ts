import { canonicalizeScopePath } from "@/features/scopes/lib/scopeRoutes";

const ORG = "11111111-1111-4111-8111-111111111111";
const TYPE = "22222222-2222-4222-8222-222222222222";
const SCOPE = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";

describe("canonicalizeScopePath", () => {
  it("returns null when every segment is already canonical", () => {
    expect(
      canonicalizeScopePath("/organizations/acme/scopes/teams/design", [
        { param: "acme", expected: "acme" },
        { param: "teams", expected: "teams" },
        { param: "design", expected: "design" },
      ]),
    ).toBeNull();
  });

  it("rewrites every UUID segment in one pass, deep path preserved", () => {
    expect(
      canonicalizeScopePath(
        `/organizations/${ORG}/scopes/${TYPE}/${SCOPE}/${ITEM}`,
        [
          { param: ORG, expected: "acme" },
          { param: TYPE, expected: "teams" },
          { param: SCOPE, expected: "design" },
          { param: ITEM, expected: "mission" },
        ],
      ),
    ).toBe("/organizations/acme/scopes/teams/design/mission");
  });

  it("keeps trailing route segments such as /edit", () => {
    expect(
      canonicalizeScopePath(`/organizations/acme/scopes/${TYPE}/edit`, [
        { param: "acme", expected: "acme" },
        { param: TYPE, expected: "teams" },
      ]),
    ).toBe("/organizations/acme/scopes/teams/edit");
  });

  it("rewrites only the resolved levels, leaving the rest addressed by id", () => {
    expect(
      canonicalizeScopePath(`/organizations/${ORG}/scopes/${TYPE}/${SCOPE}`, [
        { param: ORG, expected: "acme" },
      ]),
    ).toBe(`/organizations/acme/scopes/${TYPE}/${SCOPE}`);
  });

  it("does not let a slug repeated at another level capture the wrong segment", () => {
    // The org and the scope type both answer to `sales`; only the TYPE segment
    // is being rewritten, and it must not swallow the org segment.
    expect(
      canonicalizeScopePath("/organizations/sales/scopes/sales/west", [
        { param: "sales", expected: "sales" },
        { param: "sales", expected: "regions" },
      ]),
    ).toBe("/organizations/sales/scopes/regions/west");
  });

  it("ignores paths it does not own and empty substitution lists", () => {
    expect(
      canonicalizeScopePath(`/marketing/${ORG}/websites`, [
        { param: ORG, expected: "acme" },
      ]),
    ).toBeNull();
    expect(canonicalizeScopePath("/organizations/acme/scopes", [])).toBeNull();
  });
});
