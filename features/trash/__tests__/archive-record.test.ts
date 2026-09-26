/**
 * THE ONE ARCHIVE (verify RC-B11 round 2, finding 5): any registered record Trash lists can be
 * archived by the person's own write of `deleted_at` on its table — the mirror of restore — so no
 * surface needs (or writes) its own soft delete. A row that is not there (already archived, or not
 * this person's to archive) is said, never silent.
 *
 * Use case: the verifier archives a studio document ("Kiln log") after checking it.
 */
const calls: Array<{ schema: string; table: string; patch: Record<string, unknown>; eq: [string, string]; is: [string, null] }> = [];
let rows: { id: string }[] = [{ id: "doc-1" }];
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: (schema: string) => ({
      from: (table: string) => ({
        update: (patch: Record<string, unknown>) => ({
          eq: (c: string, v: string) => ({
            is: (c2: string, v2: null) => ({
              select: async () => {
                calls.push({ schema, table, patch, eq: [c, v], is: [c2, v2] });
                return { data: rows, error: null };
              },
            }),
          }),
        }),
      }),
    }),
  },
}));
jest.mock("@/features/scopes/registry/entityRegistry", () => ({
  tryGetEntityInfo: (t: string) => (t === "document" ? { token: "document", schema: "content", table: "document" } : null),
}));

import { archiveRecord } from "../service";

beforeEach(() => { calls.length = 0; rows = [{ id: "doc-1" }]; });

it("archives through the record's own table: deleted_at set, only a live row", async () => {
  await archiveRecord("document", "doc-1", '"Kiln log"');
  expect(calls).toHaveLength(1);
  expect(calls[0].schema).toBe("content");
  expect(calls[0].table).toBe("document");
  expect(typeof calls[0].patch.deleted_at).toBe("string");
  expect(calls[0].eq).toEqual(["id", "doc-1"]);
  expect(calls[0].is).toEqual(["deleted_at", null]);
});

it("says so when nothing was archived (already archived, or not yours)", async () => {
  rows = [];
  await expect(archiveRecord("document", "doc-1", '"Kiln log"')).rejects.toThrow();
});

it("refuses a kind it cannot reach, in words", async () => {
  await expect(archiveRecord("mystery", "x")).rejects.toThrow(/can't be archived from here/);
});
