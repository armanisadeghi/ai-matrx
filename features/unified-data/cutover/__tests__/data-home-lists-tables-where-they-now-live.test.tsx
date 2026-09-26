/**
 * Lane SWITCH-AFTERMATH (A) — /data's home after Data tables → new system.
 *
 * Arman pressed the switch on his organization and /data "shows blanks everywhere": the home read
 * only the older store (`get_user_tables`), whose tables the press had just archived. The home must
 * list the organization's tables where they now live — names, row and column counts, the same card
 * actions — and say in one line what happened, with the way back.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const ORG = "11f4e747-c13a-49c7-81a3-66e6391f8a9b"; // Harbor Dental Group (admin's test org)
const ME = "87a6e699-3622-4869-8843-d0867456c0dd";

const publicRpc = jest.fn();
const schemaRpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => publicRpc(...a),
    schema: (schema: string) => ({ rpc: (fn: string, args?: unknown) => schemaRpc(schema, fn, args) }),
  },
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));
jest.mock("@/utils/supabase/claimsUser", () => ({
  getClaimsUser: async () => ({ data: { user: { id: ME } } }),
}));
jest.mock("@/lib/organizations/systemOrg", () => ({ resolveSystemOrgId: async () => "39c38960-0000-4000-8000-000000000000" }));
jest.mock("@/features/data-tables/service", () => ({
  listExampleTables: async () => ({ success: true, data: [] }),
  archiveTable: jest.fn(async () => ({ success: true, data: {} })),
}));
jest.mock("@/features/data-tables/data-source/table-home", () => ({ placeTableInRecordStore: jest.fn() }));
jest.mock("../../../../components/user-generated-table-data/CreateTableModal", () => () => null);
jest.mock("../../../../components/user-generated-table-data/EditTableModal", () => () => null);

import TableCards from "@/components/user-generated-table-data/TableCards";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  publicRpc.mockReset();
  schemaRpc.mockReset();
  // Every older table of the organization was archived by the press: the older list is empty.
  publicRpc.mockImplementation(async (fn: string) => {
    if (fn === "get_user_tables") return { data: { success: true, tables: [] }, error: null };
    throw new Error(`unexpected rpc ${fn}`);
  });
  schemaRpc.mockImplementation(async (schema: string, fn: string, args: { p_organization_id?: string }) => {
    if (schema === "platform" && fn === "data_tables_switched_for_me") {
      return {
        data: [{ organization_id: ORG, organization_name: "Harbor Dental Group", switched_at: "2026-09-26T13:18:00Z", switched_by: "admin@admin.com" }],
        error: null,
      };
    }
    if (schema === "custom" && fn === "table_list_everywhere" && args?.p_organization_id === ORG) {
      return {
        data: {
          success: true,
          tables: [
            { id: "b00bde4d-1adc-4682-88eb-57453aabf014", table_name: "Hygiene Recall Schedule", description: "Patients due for their six-month cleaning, by hygienist.", row_count: 4, field_count: 5, user_id: ME, visibility: "internal", organization_id: ORG, updated_at: "2026-09-26T13:18:00Z", store: "records" },
            { id: "a224d20e-33d8-4535-9653-e569469607d6", table_name: "Operatory Supply Orders", description: "Weekly restock requests for the four operatories.", row_count: 3, field_count: 4, user_id: ME, visibility: "internal", organization_id: ORG, updated_at: "2026-09-26T13:17:00Z", store: "records" },
          ],
        },
        error: null,
      };
    }
    throw new Error(`unexpected ${schema}.${fn}`);
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test("after the switch the home lists the organization's tables where they live, with names, counts and the way back", async () => {
  await act(async () => {
    root.render(<TableCards />);
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  const text = container.textContent ?? "";
  expect(text).toContain("Hygiene Recall Schedule");
  expect(text).toContain("Operatory Supply Orders");
  expect(text).toMatch(/Rows:\s*4/);
  expect(text).toMatch(/Fields:\s*5/);
  expect(text).toContain("Data tables moved to the new system on");
  expect(text).toContain("by admin@admin.com");
  const back = [...container.querySelectorAll("a")].find((a) => a.textContent === "Switch back");
  expect(back?.getAttribute("href")).toBe(`/organizations/${ORG}/settings#data`);
  // The cards open the same address; the table page there opens the new system.
  const open = [...container.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/data/b00bde4d-1adc-4682-88eb-57453aabf014");
  expect(open).toBeTruthy();
});
