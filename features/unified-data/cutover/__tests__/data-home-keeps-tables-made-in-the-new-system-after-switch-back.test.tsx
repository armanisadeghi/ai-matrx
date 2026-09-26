/**
 * Lane SWITCH-BACK-CARRIES (VERIFIER-26 item 6b) — /data's home after Switch back.
 *
 * While Harbor Dental Group was switched, an agent made "Hygienist Time-Off Requests" in the new
 * system. Switch back brings the older tables back, and the home lists them from the older store —
 * but the agent's table has no older twin, so it vanished from /data. The home must keep listing a
 * table made in the new system where it lives (and open it there), and must NOT list the older
 * tables' copies twice or send them to the new system.
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
import { placeTableInRecordStore } from "@/features/data-tables/data-source/table-home";

const BORN = "6ab02228-7d3e-4c55-9d1e-2f7a3b9c1e40";
const OLDER = "b00bde4d-1adc-4682-88eb-57453aabf014";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  publicRpc.mockReset();
  schemaRpc.mockReset();
  (placeTableInRecordStore as jest.Mock).mockReset();
  // Switched back: the older table is live again and the older list has it.
  publicRpc.mockImplementation(async (fn: string) => {
    if (fn === "get_user_tables") {
      return {
        data: { success: true, tables: [
          { id: OLDER, table_name: "Hygiene Recall Schedule", description: "Patients due for their six-month cleaning, by hygienist.", row_count: 4, field_count: 5, user_id: ME, is_public: false, organization_id: ORG, updated_at: "2026-09-26T14:19:49Z" },
        ] },
        error: null,
      };
    }
    throw new Error(`unexpected rpc ${fn}`);
  });
  schemaRpc.mockImplementation(async (schema: string, fn: string, args: { p_organization_id?: string }) => {
    if (schema === "platform" && fn === "data_tables_switched_for_me") return { data: [], error: null };
    if (schema === "platform" && fn === "data_tables_born_in_the_new_system_for_me") {
      return { data: [{ organization_id: ORG, organization_name: "Harbor Dental Group", table_id: BORN }], error: null };
    }
    if (schema === "custom" && fn === "table_list_everywhere" && args?.p_organization_id === ORG) {
      return {
        data: { success: true, tables: [
          { id: BORN, table_name: "Hygienist Time-Off Requests", description: "Made by the scheduling agent.", row_count: 2, field_count: 3, user_id: ME, visibility: "internal", organization_id: ORG, updated_at: "2026-09-26T14:12:00Z", store: "records" },
          // The older table's same-id copy is in the store too; it must not be listed twice.
          { id: OLDER, table_name: "Hygiene Recall Schedule", description: "", row_count: 4, field_count: 5, user_id: ME, visibility: "internal", organization_id: ORG, updated_at: "2026-09-26T14:19:49Z", store: "records" },
        ] },
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

test("after Switch back the home still lists a table made in the new system, where it lives, and the older tables once", async () => {
  await act(async () => {
    root.render(<TableCards />);
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  const text = container.textContent ?? "";
  expect(text).toContain("Hygienist Time-Off Requests");
  expect(text.split("Hygiene Recall Schedule").length - 1).toBe(1);
  expect(text).not.toContain("Data tables moved to the new system on");
  const calls = (placeTableInRecordStore as jest.Mock).mock.calls.map((c) => c[0]);
  expect(calls).toEqual([BORN]);
  const open = [...container.querySelectorAll("a")].find((a) => a.getAttribute("href") === `/data/${BORN}`);
  expect(open).toBeTruthy();
});
