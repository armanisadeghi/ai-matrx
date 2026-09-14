/**
 * DD-236 — THE WINNER IS THE DECLARED DEFAULT, NEVER THE OLDEST ROW.
 *
 * The warm tier's SELECT decides whether the deterministic contract in
 * `sortKindComponentRows` has anything to act on. PostgREST returns ONLY the
 * columns a select names, so a warm row whose `is_default` / `sort_order` were
 * not selected reaches the client-side defense sort as `false` / `0` — and
 * that sort then re-orders the whole tier by `created_at`, throwing the SQL
 * order away. The organization marks a component default; the reader gets
 * whichever row happened to be authored first.
 *
 * Measured live on 2026-09-14 (`brsgrqvjdzwihsvnfqkf`, admin@admin.com): of
 * the 25 resolver keys with more than one live candidate, SEVEN resolved to a
 * different row than their declared default — five of them to a row flagged
 * `is_active = false`, i.e. to no organization component at all.
 *
 * The mock below projects columns the way PostgREST does (a column that was
 * not selected is not in the row), which is what makes this a forcing
 * function rather than a restatement of the sort's unit test.
 */

const mockSelects: string[] = [];
const mockFrom = jest.fn();
const mockSchema = jest.fn(() => ({ from: mockFrom }));

interface MockQuery {
  select(columns: string): MockQuery;
  is(column: string, value: unknown): MockQuery;
  not(column: string, operator: string, value: unknown): MockQuery;
  neq(column: string, value: unknown): MockQuery;
  order(): MockQuery;
  range(): Promise<{ data: unknown[]; error: null; count: number }>;
}

/**
 * `rows` are given in the order the SQL `order by` clause would return them.
 * Only the columns named by `select()` survive — exactly like the wire.
 */
function queryFor(rows: Array<Record<string, unknown>>) {
  let columns: string[] = [];
  let query: MockQuery;
  const project = () =>
    rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const column of columns) {
        if (column in row) out[column] = row[column];
      }
      if (columns.includes("kind_definition") && "kind_definition" in row) {
        out.kind_definition = row.kind_definition;
      }
      return out;
    });
  query = {
    select: jest.fn((select: string) => {
      mockSelects.push(select);
      columns = select
        .replace(/kind_definition!inner\([^)]*\)/g, "kind_definition")
        .split(",")
        .map((part) => part.trim());
      return query;
    }),
    is: jest.fn(() => query),
    not: jest.fn(() => query),
    neq: jest.fn(() => query),
    order: jest.fn(() => query),
    range: jest.fn(async () => {
      const data = project();
      return { data, error: null, count: data.length };
    }),
  };
  return query;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: mockSchema },
}));

jest.mock("@ai-matrx/data/db", () => ({
  readAllRows: jest.fn(
    async (
      loadPage: (range: {
        from: number;
        to: number;
      }) => Promise<{ data: unknown[] | null; error: unknown }>,
    ) => {
      const result = await loadPage({ from: 0, to: 999 });
      if (result.error) throw result.error;
      return result.data ?? [];
    },
  ),
}));

import { listKindComponentsFromTables } from "../registry/schema-source-kind-components";

const base = {
  kind_definition_id: "kind-def-1",
  platform: "web",
  role: "output",
  source: "db",
  is_active: true,
  config: {},
  pinned_kind_version: null,
  updated_at: "2026-08-23T09:00:00Z",
  created_by: null,
  kind_definition: { kind: "keyword_relationship_map", deleted_at: null },
};

/** The live shape of `keyword_relationship_map|web|output` (2026-09-14). */
const OLDER_NON_DEFAULT = {
  ...base,
  id: "97cf18e2-e767-4118-bb7a-23e21ce77c6f",
  component_key: "keyword_relationship_map_alt",
  is_default: false,
  sort_order: 100,
  created_at: "2026-08-23T08:55:40.709109+00:00",
};
const NEWER_DEFAULT = {
  ...base,
  id: "59e7b8ff-3c1e-458b-bd46-faff66a0dfc0",
  component_key: "keyword_relationship_map_main",
  is_default: true,
  sort_order: 100,
  created_at: "2026-08-23T08:57:20.233111+00:00",
};

beforeEach(() => {
  mockSelects.length = 0;
  mockFrom.mockReset();
  mockSchema.mockClear();
});

test("the warm tier selects the columns its own order-by names", async () => {
  mockFrom
    .mockImplementationOnce(() => queryFor([NEWER_DEFAULT, OLDER_NON_DEFAULT]))
    .mockImplementationOnce(() => queryFor([]));

  await listKindComponentsFromTables();

  expect(mockSelects[0]).toContain("is_default");
  expect(mockSelects[0]).toContain("sort_order");
});

test("the declared default wins even when it is the NEWER row", async () => {
  mockFrom
    .mockImplementationOnce(() => queryFor([NEWER_DEFAULT, OLDER_NON_DEFAULT]))
    .mockImplementationOnce(() => queryFor([]));

  const rows = await listKindComponentsFromTables();

  // First row per (kind, platform, role) is the one the registry keeps.
  expect(rows.map((r) => r.componentKey)).toEqual([
    "keyword_relationship_map_main",
    "keyword_relationship_map_alt",
  ]);
});

test("a lower sort_order outranks an older row", async () => {
  const older = {
    ...OLDER_NON_DEFAULT,
    sort_order: 100,
    created_at: "2026-08-01T00:00:00Z",
  };
  const newerButFirst = {
    ...NEWER_DEFAULT,
    is_default: false,
    sort_order: 10,
    created_at: "2026-08-02T00:00:00Z",
  };
  mockFrom
    .mockImplementationOnce(() => queryFor([newerButFirst, older]))
    .mockImplementationOnce(() => queryFor([]));

  const rows = await listKindComponentsFromTables();

  expect(rows[0].componentKey).toBe("keyword_relationship_map_main");
});

test("created_at stays the last tiebreak when default and sort_order tie", async () => {
  const older = {
    ...OLDER_NON_DEFAULT,
    sort_order: 100,
    created_at: "2026-08-01T00:00:00Z",
  };
  const newer = {
    ...NEWER_DEFAULT,
    is_default: false,
    sort_order: 100,
    created_at: "2026-08-02T00:00:00Z",
  };
  mockFrom
    .mockImplementationOnce(() => queryFor([older, newer]))
    .mockImplementationOnce(() => queryFor([]));

  const rows = await listKindComponentsFromTables();

  expect(rows[0].componentKey).toBe("keyword_relationship_map_alt");
});

test("the compiled floor still loses to a real component, default flag or not", async () => {
  // A `generic_structured` row carrying is_default=true is exactly the
  // 2026-08-23 outage; selecting the flag must not resurrect it.
  const fallback = {
    ...base,
    id: "00000000-0000-0000-0000-00000000fa11",
    component_key: "generic_structured",
    is_default: true,
    sort_order: 0,
    created_at: "2026-08-01T00:00:00Z",
  };
  mockFrom
    .mockImplementationOnce(() => queryFor([fallback, OLDER_NON_DEFAULT]))
    .mockImplementationOnce(() => queryFor([]));

  const rows = await listKindComponentsFromTables();

  expect(rows.map((r) => r.componentKey)).toEqual([
    "keyword_relationship_map_alt",
    "generic_structured",
  ]);
});
