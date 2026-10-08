jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({}) }));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: async () => "org" }));
jest.mock("../agency-install", () => ({ pageOrganizationId: async () => "org" }));

import { planTableDatabase } from "../table-to-database";

describe("simple table → database (C14)", () => {
  it("header row names the properties; the first column is the title; body rows become records", () => {
    const plan = planTableDatabase({
      headerRow: true,
      rows: [
        ["Client", "Owner", "Stage"],
        ["Northshore PT", "Dana", "Onboarding"],
        ["", "", ""],
        ["Harbor Dental", "", "Proposal"],
      ],
    });
    expect(plan.fields.map((f) => [f.key, f.label])).toEqual([
      ["name", "Client"],
      ["owner", "Owner"],
      ["stage", "Stage"],
    ]);
    expect(plan.records).toEqual([
      { name: "Northshore PT", owner: "Dana", stage: "Onboarding" },
      { name: "Harbor Dental", stage: "Proposal" },
    ]);
  });

  it("no header row: Name, Column 2… and every row is a record", () => {
    const plan = planTableDatabase({ headerRow: false, rows: [["Kickoff", "Mon"], ["Review", "Fri"]] });
    expect(plan.fields.map((f) => f.label)).toEqual(["Name", "Column 2"]);
    expect(plan.records).toHaveLength(2);
  });
});
