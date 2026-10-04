/**
 * A SIGNED-OUT reader of the kind registry asks only for the columns `anon`
 * may read — so the registry renders kinds for a guest instead of capturing
 * `permission denied for table kind_definition`.
 *
 * Live 2026-10-01 (/demos/board, signed out): ~13 "kind-registry cold fetch
 * failed … permission denied for table kind_definition". DD-230 bounded
 * `anon` on `content_ir.kind_definition` to a column list
 * (`lib/security/public-exposure.ts#ANON_COLUMN_SURFACE`) WITHOUT `metadata`,
 * and the registry's light catalog + cold read both select `metadata`.
 * PostgREST refuses the WHOLE request when one selected column is not granted.
 *
 * The fake client below behaves like PostgREST under a column grant: a
 * signed-out request that names (select, filter, or order) a column outside
 * the declared bound answers 42501. The bound is read from the register, so
 * the day the register or the registry's select drifts, this goes red.
 */

import { ANON_COLUMN_SURFACE } from "@/lib/security/public-exposure";

type Session = { access_token: string } | null;
let mockSession: Session = null;
const requested: Array<{ table: string; columns: string[]; signedIn: boolean }> = [];

const KIND_ROW = {
  id: "def-1",
  kind: "spatial_scene",
  label: "Spatial scene",
  data: null,
  metadata: { loading_component: "spatial_loader" },
  loading_component: "spatial_loader",
  emitted_json_schema: {
    type: "object",
    properties: { title: { type: "string" }, __kind: { const: "spatial_scene" } },
  },
  created_at: "2026-01-01T00:00:00Z",
};

function boundFor(table: string): Set<string> {
  const entry = ANON_COLUMN_SURFACE.find((e) => e.relation === `content_ir.${table}`);
  if (!entry) throw new Error(`no anon bound declared for content_ir.${table}`);
  return new Set(entry.columns);
}

/** Column names a PostgREST select string touches (`a:b->>c` → `b`). */
function selectedColumns(select: string): string[] {
  return select
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const afterAlias = part.includes(":") ? part.slice(part.indexOf(":") + 1) : part;
      return afterAlias.split("->")[0].trim();
    });
}

function makeQuery(table: string) {
  const touched: string[] = [];
  const projected: string[] = [];
  let range: [number, number] | null = null;
  const q = {
    select(cols: string) {
      touched.push(...selectedColumns(cols));
      projected.push(
        ...cols.split(",").map((p) => p.trim().split(":")[0].split("->")[0].trim()),
      );
      return q;
    },
    eq(col: string) {
      touched.push(col);
      return q;
    },
    is(col: string) {
      touched.push(col);
      return q;
    },
    in(col: string) {
      touched.push(col);
      return q;
    },
    order(col: string) {
      touched.push(col);
      return q;
    },
    limit() {
      return q;
    },
    range(from: number, to: number) {
      range = [from, to];
      return q;
    },
    then<T1, T2>(
      ok?: ((v: unknown) => T1 | PromiseLike<T1>) | null,
      err?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
    ) {
      const signedIn = mockSession !== null;
      requested.push({ table, columns: [...touched], signedIn });
      let result: unknown;
      if (!signedIn) {
        const bound = boundFor(table);
        const refused = touched.find((c) => !bound.has(c));
        if (refused) {
          result = {
            data: null,
            count: null,
            error: {
              code: "42501",
              message: `permission denied for table ${table}`,
              details: null,
              hint: null,
            },
          };
        }
      }
      if (!result) {
        // Project like PostgREST: only the selected (or aliased) keys come back.
        const rows =
          table === "kind_definition"
            ? [
                Object.fromEntries(
                  Object.entries(KIND_ROW).filter(([k]) => projected.includes(k)),
                ),
              ]
            : ([] as unknown[]);
        const page = range ? rows.slice(range[0], range[1] + 1) : rows;
        result = { data: page, error: null, count: rows.length };
      }
      return Promise.resolve(result).then(ok, err);
    },
  };
  return q;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: mockSession }, error: null }),
    },
    schema: () => ({ from: (table: string) => makeQuery(table) }),
  },
}));

const mockCaptureError = jest.fn();
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...args),
}));

import {
  getKindSchemaAndMetaBySlugFromTables,
  listKindCatalogFromTables,
} from "./schema-source-kind-tables";

beforeEach(() => {
  mockSession = null;
  requested.length = 0;
  mockCaptureError.mockReset();
});

describe("the kind registry reads, signed out", () => {
  it("lists the light catalog without a refused column", async () => {
    await expect(listKindCatalogFromTables()).resolves.toEqual([
      { slug: "spatial_scene", loadingComponent: null },
    ]);
  });

  it("cold-fetches one kind without a refused column and still derives its schema", async () => {
    const result = await getKindSchemaAndMetaBySlugFromTables("spatial_scene");
    expect(result).not.toBeNull();
    expect(result?.schema).not.toBeNull();
    expect(result?.loadingComponent).toBeNull();
    for (const r of requested) {
      const bound = boundFor(r.table);
      expect(r.columns.filter((c) => !bound.has(c))).toEqual([]);
    }
  });
});

describe("the kind registry reads, signed in", () => {
  it("keeps the declared loading component (metadata) for a person with a session", async () => {
    mockSession = { access_token: "t" };
    await expect(listKindCatalogFromTables()).resolves.toEqual([
      { slug: "spatial_scene", loadingComponent: "spatial_loader" },
    ]);
    const result = await getKindSchemaAndMetaBySlugFromTables("spatial_scene");
    expect(result?.loadingComponent).toBe("spatial_loader");
    expect(requested.some((r) => r.columns.includes("metadata"))).toBe(true);
  });
});
