/**
 * A NEW COLUMN LETS THE STORE CHOOSE ITS KEY (lane DATA-V2-BASICS, 2026-09-27).
 *
 * Arman's Coding Accounts: the column "Resets" (key `resets`) was renamed "Account Type". On the
 * Sheet, "Add column" → "Resets" was refused *This table already has a field called "Resets"* — the
 * older dialog guesses the key from the name (`resets`) and the seam sent that guess as an ASKED-FOR
 * key, which the store must honour exactly or refuse. The key is the store's to choose:
 * `custom.field_declare` derives it from the name and picks one no column has ever held
 * (`resets_2`), so the seam sends the name and never the guess.
 *
 * RED on the pre-lane seam: the spec carried `key: "resets"`.
 */
export {};

const ORG = "11f4e747-c13a-49c7-81a3-66e6391f8a9b";
const USER = "87a6e699-3622-4869-8843-d0867456c0dd";
const TABLE = "377b783a-f18a-40c3-bf2b-7617691d0091";

const declared: Array<{ table_id: string; spec: Record<string, unknown> }> = [];
const client = {
  fieldDeclare: jest.fn(async (args: { table_id: string; spec: Record<string, unknown> }) => {
    declared.push(args);
    return { ok: true as const, data: "5e1f0000-0000-4000-8000-00000000new1" };
  }),
};

jest.mock("@ai-matrx/records/core", () => ({
  ...jest.requireActual("@ai-matrx/records/core"),
  createRecordsClient: () => client,
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({ schema: () => ({ rpc: async () => ({ data: [], error: null }) }), rpc: async () => ({ data: null, error: null }) }) }));

const HOME = { store: "record" as const, organizationId: ORG, userId: USER };

test('adding "Resets" sends the name and lets the store choose the key', async () => {
  const rs = await import("../record-store");
  const made = await rs.addColumn(HOME, {
    tableId: TABLE,
    fieldName: "resets",
    displayName: "Resets",
    dataType: "string",
    isRequired: false,
  });
  expect(made).toEqual({ success: true, columnId: "5e1f0000-0000-4000-8000-00000000new1" });
  expect(declared).toHaveLength(1);
  expect(declared[0]!.spec.label).toBe("Resets");
  expect(declared[0]!.spec).not.toHaveProperty("key");
});
