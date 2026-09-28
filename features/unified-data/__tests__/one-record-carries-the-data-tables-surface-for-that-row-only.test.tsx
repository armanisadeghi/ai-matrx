/**
 * @jest-environment jsdom
 *
 * ONE RECORD, ON ITS OWN, CARRIES THE `matrx-user/data-tables` SURFACE FOR THAT ROW ONLY
 * (Board record tile, lane custom-data).
 *
 * THE USE CASE. The front desk puts Maple's appointment on her board as a card (records-ui's
 * `Peek`) and asks the chat beside it "mark this one checked in". The agent must read the same
 * manifest keys it reads on the table — this record as the one row, its columns as Field keys —
 * and its `cell_value` write must reach THIS record through the store, and never another row of
 * the table, which the card does not show.
 *
 * RED before this lane: `RecordStoreRecordSurface` did not exist; a record shown alone mounted no
 * surface, so an agent could neither read nor write it.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TABLE = "60f2f9f7-2f0a-4fba-a419-3e88b7f8e7fa";
const MAPLE = "b0000000-0000-4000-8000-000000000002";
const PEPPER = "b0000000-0000-4000-8000-000000000003";

type Provided = {
  surfaceName: string;
  getScope: () => Record<string, unknown>;
  getWriteHandlers: () => Record<string, unknown>;
  isEditable: boolean;
};
let provided: Provided | null = null;
const recordUpdate = jest.fn(async () => ({ ok: true }));

jest.mock("@/components/official/icons/IconInputWithValidation.dynamic", () => ({ IconInputCompact: () => null }));
jest.mock("@/features/surfaces/runtime/SurfaceRuntimeContext", () => ({
  SurfaceRuntimeProvider: (props: Provided & { children: React.ReactNode }) => {
    provided = props;
    return props.children;
  },
}));
jest.mock("@ai-matrx/records-ui", () => ({
  // The snapshot the merged grid builds, for one row: the shape the surface reads.
  gridContextSnapshot: (a: {
    tableId: string;
    table: { name: string; title_field: string | null };
    fields: Array<{ key: string }>;
    rows: Array<{ id: string; document: Record<string, unknown> }>;
    rowActions: unknown[];
    canWrite: boolean;
    total: number | null;
    search: string;
  }) => ({
    tableId: a.tableId,
    tableName: a.table.name,
    tableDescription: null,
    titleField: a.table.title_field,
    fields: a.fields,
    rowActions: a.rowActions,
    canWrite: a.canWrite,
    currentCell: null,
    currentRow: null,
    selectedRange: null,
    selectedRows: [],
    visibleRows: a.rows.map((r) => ({ id: r.id, title: String(r.document.patient ?? ""), document: r.document })),
    total: a.total,
    search: a.search,
  }),
  useRecordRights: () => mockRights,
}));
// Every hook answers the SAME object on every render, as the real store hooks do (their answers are
// state). A mock that built a fresh client per render re-ran the row-actions read on every render,
// whose answer re-rendered, forever — `act` never settled and the test timed out.
const mockClient = {
  recordUpdate,
  rowActions: async () => ({ ok: true, data: { actions: [], stale: [] } }),
};
const mockTable = { data: { id: TABLE, name: "Appointments", title_field: "patient" }, loading: false, error: null, reload: () => undefined };
const mockFields = {
  data: [
    { id: "f1", key: "patient", label: "Patient", type: "text", required: true },
    { id: "f2", key: "visit_status", label: "Visit status", type: "text", required: false },
  ],
  loading: false,
  error: null,
  reload: () => undefined,
};
const mockRecord = {
  data: { record_id: MAPLE, document: { patient: "Maple (Ferreira)", visit_status: "Scheduled" }, hidden: {}, computed: [] },
  loading: false,
  error: null,
  reload: () => undefined,
};
const mockRights = { known: true, level: "editor", write: true };
jest.mock("@ai-matrx/records/react", () => ({
  useRecordsClient: () => mockClient,
  useTable: () => mockTable,
  useFields: () => mockFields,
  useRecord: () => mockRecord,
  useRecordChangeRevision: () => 0,
}));

import { RecordStoreRecordSurface } from "../grid-agent-context/RecordStoreRecordSurface";

async function mount() {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <RecordStoreRecordSurface tableId={TABLE} recordId={MAPLE}>
        <div data-testid="peek" />
      </RecordStoreRecordSurface>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { host, root };
}

function apply(handler: unknown): (value: unknown) => Promise<void> {
  if (typeof handler === "function") return handler as (value: unknown) => Promise<void>;
  return (handler as { apply: (value: unknown) => Promise<void> }).apply;
}

describe("a record shown alone carries the data-tables surface for that row", () => {
  beforeEach(() => {
    provided = null;
    recordUpdate.mockClear();
  });

  it("registers matrx-user/data-tables and reads this record as the one row, keyed by Field keys", async () => {
    const { host, root } = await mount();
    expect(host.querySelector("[data-testid=peek]")).not.toBeNull();
    expect(provided?.surfaceName).toBe("matrx-user/data-tables");
    expect(provided?.isEditable).toBe(true);
    const scope = provided!.getScope();
    expect(scope["table_id"]).toBe(TABLE);
    expect(scope["table_name"]).toBe("Appointments");
    expect((scope["column_list"] as Array<{ name: string }>).map((c) => c.name)).toEqual(["patient", "visit_status"]);
    const csv = String(scope["visible_data_csv"]);
    expect(csv).toContain(MAPLE);
    expect(csv).not.toContain(PEPPER);
    act(() => root.unmount());
  });

  it("cell_value writes this record through the store and refuses any other row", async () => {
    const { root } = await mount();
    const write = apply(provided!.getWriteHandlers()["cell_value"]);
    await write({ row_id: MAPLE, field_name: "visit_status", value: "Checked in" });
    expect(recordUpdate).toHaveBeenCalledWith({ record_id: MAPLE, patch: { visit_status: "Checked in" } });
    await expect(write({ row_id: PEPPER, field_name: "visit_status", value: "Checked in" })).rejects.toThrow(
      /not one of the 1 row\(s\) on screen/,
    );
    expect(recordUpdate).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
