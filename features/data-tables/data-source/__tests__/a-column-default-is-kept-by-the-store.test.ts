/**
 * A COLUMN'S DEFAULT IS KEPT BY THE STORE (lane DATA-V2-BASICS-2, Arman 2026-09-27).
 *
 * Arman added a column with a default on /data-v2 and was refused: *"A record-store column has no
 * default value. Leave it empty and fill the rows you need."* — false: the store keeps a Field's
 * `default`, and since `databasics2_a_column_default_fills_a_new_record.sql` every new record that
 * does not name the column starts with it. The seam passes the dialog's default through: as
 * `spec.default` when a column is added, as `patch.default` when one is edited (an emptied box
 * clears it).
 *
 * THE USE CASE: Cedar Ridge Physical Therapy's "Clinic Equipment Log" gets a "Condition" column
 * whose new rows start "Good", and a "Service Interval Days" column whose new rows start 90.
 *
 * RED on the pre-lane seam: addColumn refused, and the edit refused "no default value to set".
 */
export {};

const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const USER = "87a6e699-3622-4869-8843-d0867456c0dd";
const TABLE = "46ae8d53-4068-4593-9439-fb2b656767f1";
const INTERVAL = "5e1f0000-0000-4000-8000-0000000000a1";

const declared: Array<{ table_id: string; spec: Record<string, unknown> }> = [];
const updated: Array<{ field_id: string; patch: Record<string, unknown> }> = [];
const INTERVAL_FIELD = { id: INTERVAL, key: "service_interval_days", label: "Service Interval Days", type: "number", rules: [], default: 180 };
const known: Record<string, (...a: never[]) => Promise<unknown>> = {
  fieldDeclare: async (args: { table_id: string; spec: Record<string, unknown> }) => {
    declared.push(args);
    return { ok: true as const, data: "5e1f0000-0000-4000-8000-00000000new1" };
  },
  fieldUpdate: async (args: { field_id: string; patch: Record<string, unknown> }) => {
    updated.push(args);
    return { ok: true as const, data: args.field_id };
  },
  fields: async () => ({ ok: true as const, data: [INTERVAL_FIELD] }),
  recordRead: async () => ({ ok: true as const, data: { id: TABLE, document: { name: "Clinic Equipment Log", title_field: "title", default_sort: [] } } }),
  myLevels: async () => ({ ok: true as const, data: [{ id: TABLE, level: "admin" }] }),
};
// Every other door the table's snapshot asks answers "not served", which the seam says and reads past.
const client = new Proxy(known, {
  get: (target, name: string) =>
    target[name] ?? (async () => ({ ok: false as const, error: { code: "internal", message: `${name} not served in this test` } })),
});

jest.mock("@ai-matrx/records/core", () => ({
  ...jest.requireActual("@ai-matrx/records/core"),
  createRecordsClient: () => client,
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({ schema: () => ({ rpc: async () => ({ data: [], error: null }) }), rpc: async () => ({ data: null, error: null }) }) }));

const HOME = { store: "record" as const, organizationId: ORG, userId: USER };

beforeEach(() => {
  declared.length = 0;
  updated.length = 0;
});

test('adding "Condition" with the default "Good" declares the column with that default', async () => {
  const rs = await import("../record-store");
  const made = await rs.addColumn(HOME, {
    tableId: TABLE,
    fieldName: "condition",
    displayName: "Condition",
    dataType: "string",
    isRequired: false,
    defaultValue: "Good",
  });
  expect(made).toEqual({ success: true, columnId: "5e1f0000-0000-4000-8000-00000000new1" });
  expect(declared[0]!.spec.default).toBe("Good");
});

test("an empty default box declares no default", async () => {
  const rs = await import("../record-store");
  await rs.addColumn(HOME, { tableId: TABLE, fieldName: "notes", displayName: "Notes", dataType: "string", isRequired: false, defaultValue: "" });
  expect(declared[0]!.spec).not.toHaveProperty("default");
});

test("editing a column's default sends it as a patch, and emptying the box clears it", async () => {
  const rs = await import("../record-store");
  const one = await rs.updateTableConfig(HOME, { tableId: TABLE, fieldUpdates: [{ id: INTERVAL, default_value: 90 }] } as never);
  expect(one.success).toBe(true);
  expect(updated.at(-1)).toEqual({ field_id: INTERVAL, patch: { default: 90 } });
  await rs.updateTableConfig(HOME, { tableId: TABLE, fieldUpdates: [{ id: INTERVAL, default_value: "" }] } as never);
  expect(updated.at(-1)).toEqual({ field_id: INTERVAL, patch: { default: null } });
});

test("an unchanged default sends nothing", async () => {
  const rs = await import("../record-store");
  await rs.updateTableConfig(HOME, { tableId: TABLE, fieldUpdates: [{ id: INTERVAL, default_value: 180 }] } as never);
  expect(updated).toHaveLength(0);
});
