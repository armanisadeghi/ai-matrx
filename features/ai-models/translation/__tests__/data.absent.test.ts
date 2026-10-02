/**
 * On a database without the translation tables (live, before the C2 apply) the
 * read must answer `absent` — the screen then says so in one line — never throw.
 *
 * The trap this guards: `readAllRows` rewraps a failed page as a bare Error and
 * drops the PostgREST code, so detecting "not here" through it never fires and
 * the screen shows a failure instead. PostgREST answers a missing table with
 * HTTP 404 + PGRST205 (measured on the clone, 2026-10-02).
 */

const probeResult: { data: unknown; error: unknown; status: number } = {
  data: null,
  error: { code: "PGRST205", message: "Could not find the table 'ai.translation_cell' in the schema cache" },
  status: 404,
};

jest.mock("@/utils/supabase/client", () => {
  const builder = {
    select: () => builder,
    limit: () => Promise.resolve(probeResult),
  };
  return {
    supabase: {
      schema: () => ({ from: () => builder }),
      rpc: () => Promise.resolve({ data: false, error: null }),
    },
  };
});

jest.mock("@ai-matrx/data/db", () => ({
  readAllRows: () => Promise.reject(new Error("readAllRows(ai.translation_cell): query failed — not found")),
}));

import { isAbsentRelationError, readTranslationBundle } from "../data";

describe("readTranslationBundle on a database without the tables", () => {
  it("answers absent, never throws", async () => {
    await expect(readTranslationBundle()).resolves.toEqual({ status: "absent" });
  });

  it("a real failure is still a failure", async () => {
    probeResult.error = { code: "42501", message: "permission denied" };
    probeResult.status = 403;
    await expect(readTranslationBundle()).rejects.toMatchObject({ code: "42501" });
  });

  it("recognises the not-here codes only", () => {
    expect(isAbsentRelationError({ code: "PGRST205" })).toBe(true);
    expect(isAbsentRelationError({ code: "42P01" })).toBe(true);
    expect(isAbsentRelationError({ code: "42501" })).toBe(false);
    expect(isAbsentRelationError(new Error("x"))).toBe(false);
  });
});
