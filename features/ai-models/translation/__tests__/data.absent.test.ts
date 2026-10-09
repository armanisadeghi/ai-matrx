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
  // `setHeader` is the admin-feature lane marker (withAdminFeature, 55e4452a40).
  // Every chain step returns the builder; awaiting it answers like PostgREST.
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "limit", "is", "eq", "order", "range", "setHeader"]) builder[m] = () => builder;
  builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(probeResult).then(res, rej);
  return {
    supabase: {
      schema: () => ({ from: () => builder, rpc: () => Promise.resolve(probeResult) }),
      rpc: () => Promise.resolve({ data: false, error: null }),
    },
  };
});

jest.mock("@ai-matrx/data/db", () => ({
  IncompleteReadError: class extends Error {},
  // Small reads (offerings, models) go through readAllRows; they exist here.
  readAllRows: () => Promise.resolve([]),
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
