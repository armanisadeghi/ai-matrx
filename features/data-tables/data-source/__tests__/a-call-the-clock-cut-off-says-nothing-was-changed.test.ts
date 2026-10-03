/**
 * A CALL THE CLOCK CUT OFF SAYS NOTHING WAS CHANGED (lane CHAIR-STORE-PERF, 2026-10-03).
 *
 * THE USE CASE: Priya, front desk at Cedar Ridge Physical Therapy, adds a "Cost" column to a
 * three-row table, and adds one visit row — while another lane's rehearsal holds a lock on the clone
 * for a minute. Both doors hit the 8 s clock. Before this lane the column dialog printed
 * "fieldDeclare: timed_out — canceling statement due to statement timeout" (she re-added the column to
 * learn whether it existed) and the row dialog's remedy was "Try a smaller page" — a sentence for a
 * page read, on a create. Postgres cancelled the whole statement, so nothing was written; the seam
 * says exactly that, in a person's words, and the remedy is "try again", on both doors.
 *
 * RED on the pre-lane seam: `addColumn` returned the door's machine line; `upsertRow` returned
 * `canceling statement due to statement timeout` with no hint, so the dialog fell back to the page-read
 * remedy. `SEAM_UNDER_TEST` points it at another copy of the seam.
 */
export {};

const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const USER = "87a6e699-3622-4869-8843-d0867456c0dd";
const TABLE = "54c4128e-a940-45b1-b5e7-5a1e78320839";
const SEAM = process.env.SEAM_UNDER_TEST ?? "../record-store";

const cutOff = (where: string) => ({
  ok: false as const,
  error: { code: "timed_out", sqlstate: "57014", message: `${where}: timed_out — canceling statement due to statement timeout` },
});

const ok = <T,>(data: T) => ({ ok: true as const, data });
const FIELDS = [
  { id: "a3f1c0de-1b2c-4d3e-9f40-5a6b7c8d9e01", key: "title", label: "Title", type: "text", sort: 1, organization_id: ORG },
  { id: "b4e2d1ef-2c3d-4e4f-8a51-6b7c8d9e0f12", key: "date", label: "Date", type: "text", sort: 2, organization_id: ORG },
  { id: "c5f3e2f0-3d4e-4f50-9b62-7c8d9e0f1a23", key: "status", label: "Status", type: "text", sort: 3, organization_id: ORG },
];
// The table's metadata the seam reads before a write (the same stubs the stale-edit test uses).
const client = {
  recordRead: jest.fn(async () => ok({ document: { name: "Field Visits" } })),
  fields: jest.fn(async () => ok(FIELDS)),
  myLevels: jest.fn(async () => ok([{ id: TABLE, level: "editor" }])),
  tableCapacity: jest.fn(async () => ok({ records: 3 })),
  fieldOptions: jest.fn(async () => ok([])),
  tableDecorations: jest.fn(async () => ok({ rules: [] })),
  rowActions: jest.fn(async () => ok({ actions: [] })),
  views: jest.fn(async () => ok([])),
  recordHeaders: jest.fn(async () => ok([])),
  fieldDeclare: jest.fn(async () => cutOff("fieldDeclare")),
  recordWrite: jest.fn(async () => cutOff("recordWrite")),
};

jest.mock("@ai-matrx/records/core", () => ({
  ...jest.requireActual("@ai-matrx/records/core"),
  createRecordsClient: () => client,
}));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ schema: () => ({ rpc: async () => ({ data: [], error: null }) }), rpc: async () => ({ data: null, error: null }) }),
}));

const HOME = { store: "record" as const, organizationId: ORG, userId: USER };

test("a column the clock cut off is said not to exist, in a person's words", async () => {
  const rs = await import(SEAM);
  const made = await rs.addColumn(HOME, { tableId: TABLE, fieldName: "cost", displayName: "Cost", dataType: "number", isRequired: false });
  expect(made.success).toBe(false);
  expect(made.error).toBe("The column was not added. The store took too long to answer, so nothing was changed. Try again in a moment.");
  expect(made.error).not.toMatch(/canceling statement|timed_out|fieldDeclare/);
});

test("a row the clock cut off says nothing was changed and never 'try a smaller page'", async () => {
  const rs = await import(SEAM);
  const made = await rs.upsertRow(HOME, { tableId: TABLE, data: { title: "Pack day", date: "2026-11-03" } });
  expect(made.success).toBe(false);
  if (made.success) return;
  expect(made.error).toBe("The store took too long to answer, so nothing was changed.");
  expect(made.refusal?.hint).toBe("Try again in a moment.");
  expect(made.refusal?.code).toBe("timed_out");
  expect(`${made.error} ${made.refusal?.hint}`).not.toMatch(/smaller page|canceling statement/);
});

test("every other refusal keeps the store's own sentence", async () => {
  const rs = await import(SEAM);
  client.recordWrite.mockResolvedValueOnce({
    ok: false as const,
    error: { code: "refused_by_rule", sqlstate: "55000", message: 'Status must be one of "Pending", "Done".' },
  } as never);
  const made = await rs.upsertRow(HOME, { tableId: TABLE, data: { title: "Pack day", status: "Maybe" } });
  expect(made.success).toBe(false);
  if (made.success) return;
  expect(made.error).toBe('Status must be one of "Pending", "Done".');
});
