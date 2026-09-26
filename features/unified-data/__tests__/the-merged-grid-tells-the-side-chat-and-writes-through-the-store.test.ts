// features/unified-data/__tests__/the-merged-grid-tells-the-side-chat-and-writes-through-the-store.test.ts
//
// RECORDS-UI MERGE TRANCHES 6l + 6m — THE PAGE'S BINDINGS.
//
// THE USE CASE. The front desk at Cedar Ridge Veterinary Clinic has Appointments open on /data-v2
// with the merged grid, her cursor on Maple's desk note, two rows ticked. She asks the side chat
// "what does this note say, and mark Pepper as checked in". The agent must read the SAME
// `matrx-user/data-tables` keys it reads on /data — column names that are the Field KEYS, the page
// as CSV led by row_id, the current cell, the ticked rows — and its ONE confirmed cell write must
// go to the record store (`custom.record_update` through @ai-matrx/records), never an older door.
// A note pasted from an email is cleaned by the platform's one value cleaner.
//
// RED before this lane: none of these modules existed — the merged grid told the page nothing and
// /data-v2 mounted no agent surface.

import type { GridContextSnapshot } from "../grid-agent-context/recordStoreTableScope";

import { buildDataTablesScope } from "@/features/data-tables/agent-context/buildDataTablesScope";

import { scopeInputFromGrid } from "../grid-agent-context/recordStoreTableScope";
import { recordStoreWriteHandlers } from "../grid-agent-context/RecordStoreTableSurface";
import { recordsCleanText } from "../recordsCleanText";

jest.mock("@/components/official/icons/IconInputWithValidation.dynamic", () => ({ IconInputCompact: () => null }));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({ SurfaceRuntimeProvider: () => null }));
jest.mock("@ai-matrx/records/react", () => ({ useRecordsClient: () => null }));

const TABLE = "60f2f9f7-2f0a-4fba-a419-3e88b7f8e7fa";
const MAPLE = "b0000000-0000-4000-8000-000000000002";
const PEPPER = "b0000000-0000-4000-8000-000000000003";
const BISCUIT = "b0000000-0000-4000-8000-000000000001";

function field(id: string, key: string, label: string, type: string, extra: Record<string, unknown> = {}) {
  return { id, key, label, type, required: false, ...extra } as never;
}

const SNAPSHOT: GridContextSnapshot = {
  tableId: TABLE as never,
  tableName: "Appointments",
  tableDescription: "Every visit booked at the front desk.",
  titleField: "patient",
  fields: [
    field("f1", "patient", "Patient", "text", { required: true }),
    field("f2", "visit_status", "Visit status", "text"),
    field("f3", "visit_fee", "Visit fee", "range", { format: "currency" }),
    field("f5", "desk_notes", "Desk notes", "text"),
    field("f6", "balance_due", "Balance due", "formula"),
  ],
  rowActions: [
    { id: "a1", name: "Check in", kind: "update", steps: [{ field: "f2", set: "value", value: "Checked in" }] } as never,
  ],
  canWrite: true,
  currentCell: { rowId: MAPLE as never, key: "desk_notes", value: "Post-op check, TPLO" },
  currentRow: { id: MAPLE as never, title: "Maple (Ferreira)", document: { patient: "Maple (Ferreira)" } as never },
  selectedRange: null,
  selectedRows: [
    { id: PEPPER as never, title: "Pepper (Lindqvist)", document: { patient: "Pepper (Lindqvist)", visit_status: "Scheduled" } as never },
  ],
  visibleRows: [
    { id: MAPLE as never, title: "Maple (Ferreira)", document: { patient: "Maple (Ferreira)", visit_status: "Scheduled", desk_notes: "Post-op check, TPLO" } as never },
    { id: PEPPER as never, title: "Pepper (Lindqvist)", document: { patient: "Pepper (Lindqvist)", visit_status: "Scheduled" } as never },
  ],
  total: 3,
  search: "",
};

describe("the side chat reads the merged grid through the /data manifest keys", () => {
  it("columns are Field keys, the page leads with row_id, and the cursor, the ticked rows and the row label are there", () => {
    const scope = buildDataTablesScope(scopeInputFromGrid(SNAPSHOT)) as Record<string, unknown>;
    expect(scope["table_id"]).toBe(TABLE);
    expect(scope["table_name"]).toBe("Appointments");
    expect(scope["is_read_only"]).toBe(false);
    expect((scope["column_list"] as Array<{ name: string }>).map((c) => c.name)).toEqual([
      "patient",
      "visit_status",
      "visit_fee",
      "desk_notes",
      "balance_due",
    ]);
    expect(String(scope["visible_data_csv"]).split("\n")[0]).toBe("row_id,patient,visit_status,visit_fee,desk_notes,balance_due");
    expect(scope["current_cell_value"]).toBe("Post-op check, TPLO");
    expect(scope["current_column_name"]).toBe("desk_notes");
    expect(scope["current_row_id"]).toBe(MAPLE);
    expect(scope["current_row_label"]).toBe("Maple (Ferreira)");
    expect(scope["selected_rows_json"]).toEqual([{ row_id: PEPPER, patient: "Pepper (Lindqvist)", visit_status: "Scheduled" }]);
    expect((scope["row_actions"] as Array<{ name: string; description: string }>)[0]!.description).toMatch(/Visit status/);
    expect(scope["row_count"]).toBe(3);
  });
});

describe("the agent's one cell write goes to the record store", () => {
  const latest = { current: SNAPSHOT };
  it("writes ONE cell through the store door and says the store's own refusal", async () => {
    const writes: Array<[string, string, unknown]> = [];
    const handlers = recordStoreWriteHandlers(latest, async (id, key, value) => {
      writes.push([id, key, value]);
      return value === "Lost" ? { ok: false, says: "Visit status offers Scheduled, Checked in, Completed." } : { ok: true };
    });
    await handlers["cell_value"]!({ row_id: PEPPER, field_name: "visit_status", value: "Checked in" });
    expect(writes).toEqual([[PEPPER, "visit_status", "Checked in"]]);
    await expect(handlers["cell_value"]!({ row_id: PEPPER, field_name: "visit_status", value: "Lost" })).rejects.toThrow(
      /The store refused visit_status .*offers Scheduled/,
    );
  });

  it("refuses a worked-out column, a row that is not on screen, a display name and a read-only table — before any write", async () => {
    const writes: unknown[] = [];
    const handlers = recordStoreWriteHandlers(latest, async (...a) => (writes.push(a), { ok: true }));
    await expect(handlers["cell_value"]!({ row_id: MAPLE, field_name: "balance_due", value: 0 })).rejects.toThrow(/works it out/);
    await expect(handlers["cell_value"]!({ row_id: BISCUIT, field_name: "visit_status", value: "Checked in" })).rejects.toThrow(/not one of the 2 row/);
    await expect(handlers["cell_value"]!({ row_id: MAPLE, field_name: "Visit status", value: "x" })).rejects.toThrow(/not a column/);
    const readOnly = recordStoreWriteHandlers({ current: { ...SNAPSHOT, canWrite: false } }, async (...a) => (writes.push(a), { ok: true }));
    await expect(readOnly["cell_value"]!({ row_id: MAPLE, field_name: "visit_status", value: "x" })).rejects.toThrow(/is_read_only/);
    expect(writes).toEqual([]);
  });
});

describe("Clean HTML is the platform's one value cleaner", () => {
  it("strips a pasted email's tags and entities into readable words", () => {
    expect(recordsCleanText("<p>Owner called: <b>limping</b> on the left hind&nbsp;leg</p>")).toBe("Owner called: limping on the left hind leg");
  });
});
