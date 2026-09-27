/**
 * A REMOVED CHOICE THAT RECORDS STILL HOLD SAYS WHERE THEY GO (lane CHOICE-TAILS, 2026-09-27).
 *
 * THE USE CASE: Harbor Dental's visit log on the record store. "Visit Type" offers Cleaning ·
 * Exam · X-ray. The office stops booking X-rays as their own visit (they are part of the Exam
 * now), opens Column settings in the Sheet, removes X-ray and answers "Move them to Exam". Before
 * this lane the Sheet's save went through `custom.field_update` alone: X-ray was retired and the
 * two visits that held it kept a choice nobody could pick again, with nobody asked.
 *
 * Driven through the real `setFieldFormat` / `getChoiceUsage` / `undoChoiceRemoval`
 * (record-store.ts) against a fake of the store's doors: the list AND where X-ray's records go
 * must be ONE call to `custom.field_update_rehoming_choices`, its undo must come back to the
 * caller, and the undo must go back through the same door with the list and the cells as they were.
 */

export {};

const TABLE = "3260bbbe-aaa8-4148-a4d9-7ad880e7976d";
const ORG = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const USER = "87a6e699-3622-4869-8843-d0867456c0dd";
const VISIT = "0b5e7c1a-0000-4000-8000-00000000c001";
const CLEAN = "0b5e7c1a-0000-4000-8000-00000000d001";
const EXAM = "0b5e7c1a-0000-4000-8000-00000000d002";
const XRAY = "0b5e7c1a-0000-4000-8000-00000000d003";

const FIELD = {
  id: VISIT, key: "visit_type", label: "Visit Type", type: "list", sort: 10, multi: false, rules: [],
  config: { options_table_id: "opt-visit", allow_other: false }, required: false, organization_id: ORG,
  created_at: "2026-09-27T00:00:00Z", updated_at: "2026-09-27T00:00:00Z", version: 1,
};
const OPTIONS = [
  { id: CLEAN, data: { title: "Cleaning" }, metadata: { option_position: 1 } },
  { id: EXAM, data: { title: "Exam" }, metadata: { option_position: 2 } },
  { id: XRAY, data: { title: "X-ray" }, metadata: { option_position: 3 } },
];
const UNDO = {
  options: [{ id: CLEAN, words: "Cleaning" }, { id: EXAM, words: "Exam" }, { id: XRAY, words: "X-ray" }],
  cells_back: [
    { record_id: "0b5e7c1a-0000-4000-8000-0000000000a1", value: "x_ray" },
    { record_id: "0b5e7c1a-0000-4000-8000-0000000000a2", value: "x_ray" },
  ],
};

const ok = <T,>(data: T) => ({ ok: true as const, data });
const client = {
  fields: jest.fn(async () => ok([JSON.parse(JSON.stringify(FIELD))])),
  fieldOptions: jest.fn(async () => ok(JSON.parse(JSON.stringify(OPTIONS)))),
  fieldUpdate: jest.fn(async ({ field_id }: { field_id: string }) => ok(field_id)),
  fieldChoiceUsage: jest.fn(async () =>
    ok({
      [CLEAN]: { key: "cleaning", words: "Cleaning", retired: false, records: 3 },
      [EXAM]: { key: "exam", words: "Exam", retired: false, records: 0 },
      [XRAY]: { key: "x_ray", words: "X-ray", retired: false, records: 2 },
    }),
  ),
  fieldUpdateRehomingChoices: jest.fn(async (args: { field_id: string; cells_back?: unknown[] }) =>
    ok({
      field_id: args.field_id,
      rehomed: args.cells_back ? [] : [{ choice_id: XRAY, words: "X-ray", then: "move", to: EXAM, records: 2 }],
      cells_back: args.cells_back?.length ?? 0,
      undo: UNDO,
    }),
  ),
  recordRead: jest.fn(async () => ok({ document: { name: "Visit log", title_field: "notes" } })),
  myLevels: jest.fn(async () => ok([{ id: TABLE, level: "admin" }])),
  list: jest.fn(async () => ok({ rows: [] })),
  tableCapacity: jest.fn(async () => ok({ records: 0, visible: 0 })),
  tableDecorations: jest.fn(async () => ok({ rules: [] })),
  rowActions: jest.fn(async () => ok({ actions: [] })),
  views: jest.fn(async () => ok([])),
};

jest.mock("@ai-matrx/records/core", () => ({
  ...jest.requireActual("@ai-matrx/records/core"),
  createRecordsClient: () => client,
}));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({ rpc: async () => ({ data: [], error: null }), from: () => { throw new Error("the Sheet touched a table directly"); } }),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

const HOME = { store: "record" as const, organizationId: ORG, userId: USER };

async function load() {
  jest.resetModules();
  return import("../record-store");
}

beforeEach(() => {
  for (const f of Object.values(client)) f.mockClear();
});

const withoutXray = {
  id: "choice",
  options: { choices: [{ value: "Cleaning", id: CLEAN }, { value: "Exam", id: EXAM }], allowOther: false },
} as never;

test("the Sheet reads how many records hold each choice — the N the column editor says", async () => {
  const rs = await load();
  const usage = await rs.getChoiceUsage(HOME, { tableId: TABLE, fieldId: VISIT });
  expect(usage.success && usage.data[XRAY]!.records).toBe(2);
  expect(client.fieldChoiceUsage).toHaveBeenCalledWith({ field_id: VISIT });
});

test("X-ray removed and its records moved to Exam: ONE call with the list and where they go, and the undo comes back", async () => {
  const rs = await load();
  const saved = await rs.setFieldFormat(HOME, {
    tableId: TABLE,
    fieldId: VISIT,
    format: withoutXray,
    rehome: { [XRAY]: { then: "move", to: EXAM } },
  });
  expect(saved.success).toBe(true);
  expect(client.fieldUpdate).not.toHaveBeenCalled();
  expect(client.fieldUpdateRehomingChoices).toHaveBeenCalledTimes(1);
  const call = client.fieldUpdateRehomingChoices.mock.calls[0]![0] as unknown as { patch: { options: unknown }; rehome: unknown };
  expect(call.patch.options).toEqual([{ id: CLEAN, words: "Cleaning" }, { id: EXAM, words: "Exam" }]);
  expect(call.rehome).toEqual({ [XRAY]: { then: "move", to: EXAM } });
  expect(saved.success && saved.data.undo).toEqual(UNDO);
});

test("a removal with nowhere to send records is the ordinary save, as before", async () => {
  const rs = await load();
  const saved = await rs.setFieldFormat(HOME, { tableId: TABLE, fieldId: VISIT, format: withoutXray });
  expect(saved.success).toBe(true);
  expect(client.fieldUpdateRehomingChoices).not.toHaveBeenCalled();
  expect(client.fieldUpdate).toHaveBeenCalledTimes(1);
});

test("Undo goes back through the same door with the list and every cell as they were", async () => {
  const rs = await load();
  const back = await rs.undoChoiceRemoval(HOME, { tableId: TABLE, fieldId: VISIT, undo: UNDO });
  expect(back.success && back.data.cells_back).toBe(2);
  expect(client.fieldUpdateRehomingChoices).toHaveBeenCalledWith({
    field_id: VISIT,
    patch: { options: UNDO.options },
    cells_back: UNDO.cells_back,
  });
});
