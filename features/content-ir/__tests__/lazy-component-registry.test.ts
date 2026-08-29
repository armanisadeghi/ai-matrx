/**
 * THE LAZY COMPONENT REGISTRY CONTRACT (Arman, 2026-08-29): the warm list
 * carries metadata + body presence only. Component and transform bodies arrive
 * through the per-kind cold fetch.
 */

const mockSelects: string[] = [];
const mockFilters: Array<[string, string, unknown]> = [];
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

function queryFor(data: unknown[]) {
  let query: MockQuery;
  query = {
    select: jest.fn((columns: string) => {
      mockSelects.push(columns);
      return query;
    }),
    is: jest.fn((column: string, value: unknown) => {
      mockFilters.push([column, "is", value]);
      return query;
    }),
    not: jest.fn((column: string, operator: string, value: unknown) => {
      mockFilters.push([column, `not.${operator}`, value]);
      return query;
    }),
    neq: jest.fn((column: string, value: unknown) => {
      mockFilters.push([column, "neq", value]);
      return query;
    }),
    order: jest.fn(() => query),
    range: jest.fn(async () => ({ data, error: null, count: data.length })),
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

beforeEach(() => {
  mockSelects.length = 0;
  mockFilters.length = 0;
  mockFrom.mockReset();
  mockSchema.mockClear();
});

test("warm rows carry no bodies and derive hasComponentSource from an id-only projection", async () => {
  mockFrom
    .mockImplementationOnce(() =>
      queryFor([
        {
          id: "component-row-1",
          kind_definition_id: "kind-def-1",
          platform: "web",
          role: "output",
          component_key: "lazy_card",
          source: "db",
          is_active: true,
          config: {},
          pinned_kind_version: null,
          updated_at: "2026-08-29T00:00:00Z",
          created_at: "2026-08-29T00:00:00Z",
          created_by: null,
          kind_definition: { kind: "lazy_kind", deleted_at: null },
        },
      ]),
    )
    .mockImplementationOnce(() => queryFor([{ id: "component-row-1" }]));

  const rows = await listKindComponentsFromTables();

  expect(mockSelects).toHaveLength(2);
  expect(mockSelects[0]).not.toContain("component_source");
  expect(mockSelects[0]).not.toContain("props_transform");
  expect(mockSelects[1]).toBe("id");
  expect(mockFilters).toEqual(
    expect.arrayContaining([
      ["component_source", "not.is", null],
      ["component_source", "neq", ""],
    ]),
  );
  expect(rows).toEqual([
    expect.objectContaining({
      kind: "lazy_kind",
      componentSource: null,
      propsTransform: null,
      hasComponentSource: true,
    }),
  ]);
});
