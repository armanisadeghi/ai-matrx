/**
 * A REMOVED COLUMN COMES BACK WITH ITS VALUES (DATA-V2-BASICS-2 F18).
 * Removing "Network type" from Harbor Dental's "Insurance Plan Accounts" said "there is no undo in
 * the app" and then "No rows carried a value for it" — both false: the store retires a column and
 * keeps every value, and `custom.field_restore` brings it back. The seam asks that door.
 * RED before: no restoreField in the seam.
 */
export {};
const rpc = jest.fn(async () => ({ data: null, error: null }));
const schema = jest.fn(() => ({ rpc }));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({ schema, rpc: async () => ({ data: null, error: null }) }) }));

const HOME = { store: "record" as const, organizationId: "11f4e747-c13a-49c7-81a3-66e6391f8a9b", userId: "87a6e699-3622-4869-8843-d0867456c0dd" };

test("Undo on a removed column asks custom.field_restore for that column", async () => {
  const rs = await import("../record-store");
  const back = await rs.restoreField(HOME, { tableId: "377b783a-f18a-40c3-bf2b-7617691d0091", fieldId: "5e1f0000-0000-4000-8000-0000000000b2" });
  expect(back).toEqual({ success: true, data: { field_id: "5e1f0000-0000-4000-8000-0000000000b2" } });
  expect(schema).toHaveBeenCalledWith("custom");
  expect(rpc).toHaveBeenCalledWith("field_restore", { p_organization_id: HOME.organizationId, p_field_id: "5e1f0000-0000-4000-8000-0000000000b2" });
});

test("a refusal says the column is still retired and its values kept", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "You hold the editor level on this table" } } as never);
  const rs = await import("../record-store");
  const back = await rs.restoreField(HOME, { tableId: "t", fieldId: "f" });
  expect(back.success).toBe(false);
  expect((back as { error: string }).error).toContain("still retired");
});
