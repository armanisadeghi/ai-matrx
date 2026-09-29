import { type RetentionPolicyRow, fetchMeetRetentionPolicies } from "./service";

const entityRows: RetentionPolicyRow[] = Array.from({ length: 1_001 }, (_, index) => ({
  id: `entity-${index}`,
  scope: "entity",
  entity_token: "meet_meeting",
  trigger_kind: "untouched",
  mode: "archive",
  retention_days: null,
  warn_days: null,
  legal_hold: false,
  enabled: true,
  label: `Meeting rule ${index}`,
  description: null,
  basis: null,
  set_by: "system",
  review_due: null,
  effective_from: "2026-09-29T00:00:00.000Z",
  custody_selector: null,
  updated_at: "2026-09-29T00:00:00.000Z",
}));

type QueryTrace = {
  scope: string | undefined;
  entityToken: string | undefined;
  selectCount: "exact" | undefined;
  orders: string[];
  range: { from: number; to: number } | undefined;
};

const traces: QueryTrace[] = [];

type QueryResult = {
  data: RetentionPolicyRow[];
  error: null;
  count: number;
};

type QueryBuilder = {
  select: (columns: string, options?: { count?: "exact" }) => QueryBuilder;
  eq: (column: string, value: string) => QueryBuilder;
  in: (column: string, values: readonly string[]) => QueryBuilder;
  not: (column: string, operator: string, value: null) => QueryBuilder;
  order: (column: string, options: { ascending: boolean }) => QueryBuilder;
  range: (from: number, to: number) => QueryBuilder;
  returns: <T>() => Promise<QueryResult>;
};

function rowsFor(scope: string | undefined, entityToken: string | undefined): RetentionPolicyRow[] {
  if (scope === "entity" && entityToken !== "file") return entityRows;
  return [];
}

function builder(): QueryBuilder {
  const trace: QueryTrace = {
    scope: undefined,
    entityToken: undefined,
    selectCount: undefined,
    orders: [],
    range: undefined,
  };
  const query: QueryBuilder = {
    select: (_columns, options) => {
      trace.selectCount = options?.count;
      return query;
    },
    eq: (column, value) => {
      if (column === "scope") trace.scope = value;
      if (column === "entity_token") trace.entityToken = value;
      return query;
    },
    in: () => query,
    not: () => query,
    order: (column) => {
      trace.orders.push(column);
      return query;
    },
    range: (from, to) => {
      trace.range = { from, to };
      return query;
    },
    returns: async () => {
      traces.push(trace);
      const rows = rowsFor(trace.scope, trace.entityToken);
      const range = trace.range;
      if (!range) throw new Error("Retention query was not ranged");
      return {
        data: rows.slice(range.from, range.to + 1),
        error: null,
        count: rows.length,
      };
    },
  };
  return query;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ from: () => builder() }),
  },
}));

jest.mock("@ai-matrx/data/db", () => ({
  readAllRows: async (
    page: (range: { from: number; to: number }) => Promise<QueryResult>,
  ): Promise<RetentionPolicyRow[]> => {
    const rows: RetentionPolicyRow[] = [];
    for (let from = 0; ; from += 1_000) {
      const result = await page({ from, to: from + 999 });
      rows.push(...result.data);
      if (rows.length >= result.count) return rows;
    }
  },
}));

beforeEach(() => {
  traces.length = 0;
});

it("reads every Meet retention policy past PostgREST's 1,000-row cap", async () => {
  const rows = await fetchMeetRetentionPolicies();

  expect(rows).toHaveLength(1_001);
  expect(rows.at(-1)?.id).toBe("entity-1000");
  expect(
    traces
      .filter((trace) => trace.scope === "entity" && trace.entityToken === undefined)
      .map((trace) => trace.range),
  ).toEqual([
    { from: 0, to: 999 },
    { from: 1000, to: 1999 },
  ]);
  expect(traces.every((trace) => trace.selectCount === "exact")).toBe(true);
  expect(traces.every((trace) => trace.orders.includes("id"))).toBe(true);
});
