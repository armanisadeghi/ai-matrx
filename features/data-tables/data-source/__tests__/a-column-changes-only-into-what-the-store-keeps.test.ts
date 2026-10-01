/**
 * A COLUMN IS OFFERED ONLY THE KINDS THE STORE CAN KEEP, AND "DATE" IS ONE (DATA-V2-BASICS-2 T2).
 * Harbor Dental's "Operatory Supply Orders": changing "Ordered on" to Date, or "Quantity" to List,
 * pressed Save and nothing happened — the seam refused both (the store has no "date" kind; "List"
 * and "Structured data" are the older store's). "Date" is now a date-and-time column shown as a date;
 * the Stores list offers only these kinds.
 * RED before: the Date change was refused ("keeps a day as a date-and-time column").
 */
export {};
const calls: Array<{ name: string; args: unknown }> = [];
// The column's own look, as the store answers it (TABLE-EDIT-DEFECTS T26): "f-session-notes" shows as
// Number (a column changed to Number and back kept that look), "f-ordered-on" has none.
const FIELDS = [
  { id: "f-ordered-on", key: "ordered_on", label: "Ordered on", type: "text", config: {}, format: null, multi: false },
  { id: "f-session-notes", key: "session_notes", label: "Session Notes", type: "range", config: {}, format: null, multi: false, display_format: { id: "number", options: {} } },
];
const known: Record<string, (a: never) => Promise<unknown>> = {
  migrateRetype: async (a) => { calls.push({ name: "migrateRetype", args: a }); return { ok: true, data: {} }; },
  fieldUpdate: async (a) => { calls.push({ name: "fieldUpdate", args: a }); return { ok: true, data: "f" }; },
  fields: async () => ({ ok: true, data: FIELDS }),
  recordRead: async () => ({ ok: true, data: { document: {} } }),
  myLevels: async () => ({ ok: true, data: [] }),
  tableCapacity: async () => ({ ok: true, data: { records: 3 } }),
  rowActions: async () => ({ ok: true, data: { actions: [] } }),
};
const client = new Proxy(known, { get: (t, n: string) => t[n] ?? (async (a: unknown) => { calls.push({ name: n, args: a }); return { ok: true, data: {} }; }) });
jest.mock("@ai-matrx/records/core", () => ({ ...jest.requireActual("@ai-matrx/records/core"), createRecordsClient: () => client }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({ schema: () => ({ rpc: async () => ({ data: {}, error: null }) }), rpc: async () => ({ data: {}, error: null }) }) }));

const HOME = { store: "record" as const, organizationId: "11f4e747-c13a-49c7-81a3-66e6391f8a9b", userId: "87a6e699-3622-4869-8843-d0867456c0dd" };

test('"Date" becomes a date-and-time column shown as a date', async () => {
  const rs = await import("../record-store");
  const done = await rs.changeFieldType(HOME, { tableId: "a224d20e-33d8-4535-9653-e569469607d6", fieldId: "f-ordered-on", newType: "date" });
  expect(done.success).toBe(true);
  const shaped = calls.find((c) => c.name === "fieldUpdate");
  expect(shaped?.args).toMatchObject({ patch: { type: "datetime", display_format: { id: "date" } } });
});

test("the kinds offered are exactly the ones the store can keep", async () => {
  const rs = await import("../record-store");
  expect([...rs.RECORD_STORE_COLUMN_TYPES].sort()).toEqual(["boolean", "date", "datetime", "integer", "number", "string"]);
});

test("a look that no longer fits goes with the change: Number → Text clears the Number look", async () => {
  calls.length = 0;
  const rs = await import("../record-store");
  const done = await rs.changeFieldType(HOME, { tableId: "e9a69085-6429-43aa-a8b2-99414b934027", fieldId: "f-session-notes", newType: "string" });
  expect(done.success).toBe(true);
  const shaped = calls.filter((c) => c.name === "fieldUpdate");
  expect(shaped).toHaveLength(1);
  expect(shaped[0]?.args).toMatchObject({ field_id: "f-session-notes", patch: { display_format: null } });
});

test("a look that still fits is left alone: Text → Text-kind change sends no look patch", async () => {
  calls.length = 0;
  const rs = await import("../record-store");
  await rs.changeFieldType(HOME, { tableId: "a224d20e-33d8-4535-9653-e569469607d6", fieldId: "f-ordered-on", newType: "string" });
  expect(calls.filter((c) => c.name === "fieldUpdate")).toHaveLength(0);
});
