/**
 * A CLIENT ON AN OLDER @ai-matrx/records CANNOT SAVE A ROW-CHANGE SCHEDULE THAT NEVER FIRES
 * (lane SOURCE-KEY).
 *
 * The older package's `recordChangeTrigger` still writes `custom_record:<table id>`, a key the
 * store is about to refuse. The schedule screens ask `rowChangeScheduleFor`, which must answer the
 * STORE's word (`custom.record_change_actions` → `record:<table id>`) whatever the installed
 * package says. The package is mocked here to be the OLD one.
 */
const SERVICE_CALLS = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";

jest.mock("@ai-matrx/records", () => {
  const actual = jest.requireActual("@ai-matrx/records");
  return {
    ...actual,
    recordChangeTrigger: (tableId: string) => ({ type: "event", entity_type: `custom_record:${tableId}`, table_id: tableId }),
  };
});
jest.mock("@/features/data-tables/data-source/record-store-grid", () => ({
  ...jest.requireActual("@/features/data-tables/data-source/record-store-grid"),
  recordChangeActions: async (_home: unknown, tableId: string) => ({
    ok: true,
    data: { entity_type: `record:${tableId}`, table_id: tableId, actions: [{ value: "record.updated", label: "A row is changed" }] },
  }),
}));
jest.mock("@/features/data-tables/data-source/table-home", () => ({
  ...jest.requireActual("@/features/data-tables/data-source/table-home"),
  recordStoreHomeOf: (tableId: string) => (tableId === SERVICE_CALLS ? { store: "record", organizationId: "org", userId: "me" } : null),
}));

import { rowChangeScheduleFor } from "../service";

it("answers record:<table id> for a record-store table even when the installed package says custom_record:", async () => {
  const answer = await rowChangeScheduleFor({ tableId: SERVICE_CALLS });
  expect(answer?.entityType).toBe(`record:${SERVICE_CALLS}`);
});

it("answers user_table_row for an older table", async () => {
  const answer = await rowChangeScheduleFor({ tableId: "5b0c3f0e-8a7e-4d8e-9d52-2f6f3c1f1a90" });
  expect(answer?.entityType).toBe("user_table_row");
});
