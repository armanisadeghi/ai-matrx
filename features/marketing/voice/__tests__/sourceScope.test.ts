/**
 * The Voice page's Source picker scopes to the brand: only Sources behind the brand's websites'
 * pages and its brand assets' files; "All my sources" (no brand id) is the unscoped read.
 */

type Call = { table: string; ops: [string, ...unknown[]][] };
const calls: Call[] = [];
const results: Record<string, unknown[]> = {};

function builder(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const b: Record<string, unknown> = {};
  for (const op of ["select", "eq", "is", "not", "in", "order", "limit", "ilike"]) {
    b[op] = (...args: unknown[]) => {
      call.ops.push([op, ...args]);
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => void) => resolve({ data: results[table] ?? [], error: null });
  return b;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: (t: string) => builder(t) }) },
}));
jest.mock("@/lib/api/typed-client", () => ({ apiPost: jest.fn(), buildPath: jest.fn() }));

import { searchSources } from "../service";

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
});

describe("searchSources brand scope", () => {
  it("reads only the brand's page and asset documents", async () => {
    results.site = [{ id: "site1" }];
    results.brand_asset = [{ file_id: "file1" }];
    results.page = [{ processed_document_id: "docA" }];
    results.processed_documents = [
      { id: "docA", name: "Home page", created_at: "2026-09-01T00:00:00Z" },
      { id: "docB", name: "Logo guide", created_at: "2026-09-02T00:00:00Z" },
    ];
    const out = await searchSources("", "brand1");
    const siteCall = calls.find((c) => c.table === "site")!;
    expect(siteCall.ops).toContainEqual(["eq", "brand_id", "brand1"]);
    const pageCall = calls.find((c) => c.table === "page")!;
    expect(pageCall.ops).toContainEqual(["in", "site_id", ["site1"]]);
    const docCalls = calls.filter((c) => c.table === "processed_documents");
    const scoped = docCalls.find((c) => c.ops.some((o) => o[0] === "in" && o[1] === "id"))!;
    const ids = scoped.ops.find((o) => o[0] === "in" && o[1] === "id")![2] as string[];
    expect([...ids].sort()).toEqual(["docA", "docB"]);
    expect(out.map((s) => s.name)).toEqual(["Logo guide", "Home page"]);
  });

  it("returns nothing when the brand has no Sources, without reading the whole knowledge base", async () => {
    results.site = [];
    results.brand_asset = [];
    const out = await searchSources("", "brand1");
    expect(out).toEqual([]);
    expect(calls.some((c) => c.table === "processed_documents")).toBe(false);
  });

  it("without a brand id is the unscoped read (All my sources)", async () => {
    results.processed_documents = [{ id: "x", name: null, created_at: "2026-09-01T00:00:00Z" }];
    const out = await searchSources("", null);
    expect(out).toEqual([{ id: "x", name: "Untitled source", created_at: "2026-09-01T00:00:00Z" }]);
    expect(calls.every((c) => !c.ops.some((o) => o[0] === "in" && o[1] === "id"))).toBe(true);
  });
});
