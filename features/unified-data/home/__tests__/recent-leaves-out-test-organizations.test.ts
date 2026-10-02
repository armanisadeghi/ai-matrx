/**
 * The data home's Recent line never offers a row from an organization marked as a test fixture
 * (`iam.organizations.settings.test_fixture`, the stored classification the organization picker
 * and Make's Recent already use). Never a name match.
 */
import { recentRows } from "../DataHomeRecent";
import { ORGS, row } from "./fixtures";

describe("Recent leaves out test organizations", () => {
  it("skips a recent row whose organization is marked, keeps the rest in order", () => {
    const real = row({ name: "Patient Recall List" });
    const fixture = row({ name: "Spore test choices", organizationId: ORGS.rincon.id, organizationName: ORGS.rincon.name });
    const byId = new Map([real, fixture].map((r) => [r.id, r]));
    const shown = recentRows([fixture.id, real.id], byId, new Set([ORGS.rincon.id]));
    expect(shown.map((r) => r.name)).toEqual(["Patient Recall List"]);
  });

  it("shows every row when no organization is marked", () => {
    const a = row({ name: "A" });
    expect(recentRows([a.id], new Map([[a.id, a]]), new Set())).toHaveLength(1);
  });
});
