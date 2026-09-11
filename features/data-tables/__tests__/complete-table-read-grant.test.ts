/**
 * THE COMPLETE-TABLE READ IS A GRANT, AND A REFUSAL IS NEVER AN EMPTY TABLE.
 *
 * Feedback 5c31eaea (2026-09-11): on a data table shared read-only, the page
 * rendered all 400 rows while every copy action — which reads the COMPLETE
 * table through `get_user_table_complete` — was refused with
 * "viewer access required for dataset …". The cause was DB-side: the RPC's
 * SECURITY DEFINER guard re-implemented the read grant instead of applying the
 * one the row policy applies, so it was strictly stricter than the RLS
 * governing the same rows. Fixed in `migrations/udt_rpc_guards_match_row_policy.sql`,
 * which carries the DB-side equivalence assertion (the row policy admits the
 * dataset ⇒ the RPC returns every row) and refuses to apply without it.
 *
 * What THIS test pins is the frontend half of that contract, which is what
 * decides whether the next such refusal is visible or silent: `getCompleteTable`
 * must surface a refusal AS a failure. The dangerous shape is not the error —
 * it is a refusal that arrives as `{ success: true, rows: [] }`, because every
 * caller here (Copy table / Copy JSON / Current table view / the copy-subset
 * window / the JSON and CSV exports) then hands the user a confidently empty
 * table with nothing on screen saying why. "A screen never lies."
 */

const rpc = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

import { getCompleteTable } from "../service";

const TABLE_ID = "59038c18-552c-427b-b855-6268b853fd89";

/** The shape the fixed RPC returns for a table the caller may read. */
function completeTablePayload(rowCount: number) {
  return {
    success: true,
    table: { id: TABLE_ID, table_name: "Vegas Events" },
    fields: [
      { id: "f1", field_name: "name", display_name: "Name" },
      { id: "f2", field_name: "location", display_name: "Location" },
    ],
    data: Array.from({ length: rowCount }, (_, i) => ({
      id: `row-${i}`,
      data: { name: `Event ${i}`, location: "Las Vegas" },
    })),
    row_count: rowCount,
  };
}

describe("getCompleteTable — the read grant reaches the caller intact", () => {
  beforeEach(() => rpc.mockReset());

  it("hands back every row the RPC returned, not the loaded page", async () => {
    rpc.mockResolvedValue({ data: completeTablePayload(400), error: null });

    const result = await getCompleteTable({ tableId: TABLE_ID });

    expect(rpc).toHaveBeenCalledWith("get_user_table_complete", {
      p_table_id: TABLE_ID,
      p_sort_field: undefined,
      p_sort_direction: "asc",
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("unreachable");
    expect(result.data.rows).toHaveLength(400);
  });

  it("surfaces a permission refusal as a FAILURE, never as an empty table", async () => {
    // Exactly what PostgREST returns when the guard raises 42501 — the error
    // the reporter saw, and the error a genuinely unauthorized caller still
    // gets after the fix.
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: `viewer access required for dataset ${TABLE_ID}`,
      },
    });

    const result = await getCompleteTable({ tableId: TABLE_ID });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    // The reason reaches the UI verbatim; the copy-subset window renders it
    // with a Retry instead of spinning forever.
    expect(result.error).toContain("viewer access required for dataset");
  });

  it("treats an in-payload refusal as a failure too", async () => {
    // The RPC family also reports refusal inside a 200 body. A caller that
    // read `data.data` off this would copy an empty table and say nothing.
    rpc.mockResolvedValue({
      data: { success: false, error: "viewer access required for dataset" },
      error: null,
    });

    const result = await getCompleteTable({ tableId: TABLE_ID });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    expect(result.error).toContain("viewer access required for dataset");
  });
});
