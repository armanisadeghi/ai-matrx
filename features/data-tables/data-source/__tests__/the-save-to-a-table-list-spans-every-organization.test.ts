/**
 * ACCESS BELONGS TO THE PERSON (Arman, 2026-09-25). The "Save to a table" list is every table the
 * person may open in EVERY organization: `listTablesEverywhere()` with no argument asks
 * `custom.table_list_everywhere` for NULL (no organization argument), never asks the person to
 * choose an organization, and never sends the header's selected one. Only an organization a
 * picker's own on-page control names narrows it.
 */
const rpc = jest.fn();
const ensureOrgId = jest.fn(async () => "57f2a22b-5875-46c6-80df-437076421c28");
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
  createClient: () => ({ schema: () => ({ rpc: (...args: unknown[]) => rpc(...args) }) }),
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: () => ensureOrgId() }));
jest.mock("@/features/organizations/service", () => ({
  getUserOrganizations: async () => [
    { id: "org-a", name: "Cedar Ridge Physical Therapy" },
    { id: "org-b", name: "Castellano & Reyes, LLP" },
  ],
}));

import { listTablesEverywhere } from "@/features/data-tables/service";

beforeEach(() => {
  rpc.mockReset();
  ensureOrgId.mockClear();
  rpc.mockResolvedValue({
    data: {
      success: true,
      tables: [
        { id: "t1", table_name: "Clinic Supplies Count", store: "records", organization_id: "org-a" },
        { id: "t2", table_name: "Matter Intake", store: "records", organization_id: "org-b" },
      ],
    },
    error: null,
  });
});

describe("listTablesEverywhere", () => {
  it("asks for every organization — no organization argument, no picker prompt", async () => {
    const listed = await listTablesEverywhere();
    expect(rpc).toHaveBeenCalledWith("table_list_everywhere", {});
    expect(ensureOrgId).not.toHaveBeenCalled();
    expect(listed.success && listed.data.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("names each table's organization when the list spans several", async () => {
    const listed = await listTablesEverywhere();
    expect(listed.success && listed.data.map((t) => t.organization_name)).toEqual([
      "Cedar Ridge Physical Therapy",
      "Castellano & Reyes, LLP",
    ]);
  });

  it("narrows only when the caller names an organization", async () => {
    await listTablesEverywhere({ organizationId: "org-a" });
    expect(rpc).toHaveBeenCalledWith("table_list_everywhere", { p_organization_id: "org-a" });
  });
});
