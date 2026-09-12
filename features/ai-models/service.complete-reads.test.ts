import type { Database } from "@/types/database.types";

type EndpointRow = Database["ai"]["Tables"]["endpoint"]["Row"];
type ApiRow = Database["ai"]["Tables"]["api"]["Row"];

type QueryCall = {
  table: string;
  select: readonly unknown[];
  predicates: Array<readonly [string, unknown]>;
  orders: Array<readonly [string, unknown]>;
  range: readonly [number, number];
};

type TransportPage = { data: unknown[]; count: number; error: null };

const mockTransport = {
  pagesByTable: new Map<string, unknown[]>(),
  calls: [] as QueryCall[],
  reset() {
    this.pagesByTable.clear();
    this.calls = [];
  },
  page(table: string, from: number, to: number): TransportPage {
    const rows = this.pagesByTable.get(table) ?? [];
    return { data: rows.slice(from, to + 1), count: rows.length, error: null };
  },
};

function mockQuery(table: string) {
  const select: unknown[] = [];
  const predicates: Array<readonly [string, unknown]> = [];
  const orders: Array<readonly [string, unknown]> = [];
  const builder = {
    select: (...args: unknown[]) => {
      select.push(...args);
      return builder;
    },
    is: (field: string, value: unknown) => {
      predicates.push([field, value]);
      return builder;
    },
    order: (field: string, options: unknown) => {
      orders.push([field, options]);
      return builder;
    },
    range: (from: number, to: number) => {
      mockTransport.calls.push({
        table,
        select,
        predicates,
        orders,
        range: [from, to],
      });
      return Promise.resolve(mockTransport.page(table, from, to));
    },
    // PostgREST builders are awaitable. Keeping that contract in the transport
    // means the pre-fix bare select resolves to its 1,000-row server cap,
    // rather than failing for a harness-only reason.
    then<TResult1 = TransportPage, TResult2 = never>(
      onfulfilled?:
        ((value: TransportPage) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?:
        ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve(mockTransport.page(table, 0, 999)).then(
        onfulfilled,
        onrejected,
      );
    },
  };
  return builder;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({ from: (table: string) => mockQuery(table) }),
  },
}));

import { aiModelService } from "./service";

function endpointRow(index: number): EndpointRow {
  return {
    auth_ref: { secret_kind: "environment" },
    base_url: `https://endpoint-${index}.example.test`,
    byok_secret_key: null,
    created_at: "2026-09-12T00:00:00.000Z",
    created_by: null,
    deleted_at: null,
    display_name: `Endpoint ${String(index).padStart(4, "0")}`,
    doc_sources: [],
    id: `endpoint-${index}`,
    internal_name: `endpoint_${index}`,
    is_active: true,
    is_system: false,
    metadata: { fixture_source: "endpoint regression" },
    notes: null,
    organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    priority: index,
    updated_at: "2026-09-12T00:00:00.000Z",
    updated_by: null,
    vendor: "Captured vendor",
    version: 1,
    visibility: "internal",
  };
}

function apiRow(index: number): ApiRow {
  return {
    created_at: "2026-09-12T00:00:00.000Z",
    created_by: null,
    deleted_at: null,
    description: null,
    display_name: `API ${String(index).padStart(4, "0")}`,
    id: `api-${index}`,
    is_system: false,
    metadata: { fixture_source: "API regression" },
    name: `api_${index}`,
    organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
    request_defaults: { timeout_ms: 30_000 },
    rules: { params: {}, constraints: [] },
    translator_key: "openai_chat_completions",
    transport: "http",
    updated_at: "2026-09-12T00:00:00.000Z",
    updated_by: null,
    version: 1,
    visibility: "internal",
  };
}

function expectCompleteReadContract(table: string) {
  expect(mockTransport.calls).toHaveLength(2);
  expect(mockTransport.calls.map((call) => call.range)).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
  for (const call of mockTransport.calls) {
    expect(call.table).toBe(table);
    expect(call.select).toEqual(["*", { count: "exact" }]);
    expect(call.predicates).toEqual([["deleted_at", null]]);
    expect(call.orders).toEqual([
      ["display_name", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  }
}

describe("AI endpoint and API complete reads", () => {
  beforeEach(() => mockTransport.reset());

  it("fetchEndpoints reads every server-capped page through the real complete-read helper", async () => {
    mockTransport.pagesByTable.set(
      "endpoint",
      Array.from({ length: 1001 }, (_, index) => endpointRow(index)),
    );

    const endpoints = await aiModelService.fetchEndpoints();

    expect(endpoints).toHaveLength(1001);
    expect(endpoints[0]).toMatchObject({
      id: "endpoint-0",
      metadata: { fixture_source: "endpoint regression" },
    });
    expect(endpoints.at(-1)).toMatchObject({
      id: "endpoint-1000",
      auth_ref: { secret_kind: "environment" },
    });
    expectCompleteReadContract("endpoint");
  });

  it("fetchApis reads every server-capped page through the real complete-read helper", async () => {
    mockTransport.pagesByTable.set(
      "api",
      Array.from({ length: 1001 }, (_, index) => apiRow(index)),
    );

    const apis = await aiModelService.fetchApis();

    expect(apis).toHaveLength(1001);
    expect(apis[0]).toMatchObject({
      id: "api-0",
      request_defaults: { timeout_ms: 30_000 },
    });
    expect(apis.at(-1)).toMatchObject({
      id: "api-1000",
      rules: { params: {}, constraints: [] },
    });
    expectCompleteReadContract("api");
  });

  it("rejects an endpoint row whose JSON parser boundary is malformed", async () => {
    const malformed = { ...endpointRow(7), metadata: null };
    mockTransport.pagesByTable.set("endpoint", [malformed]);

    await expect(aiModelService.fetchEndpoints()).rejects.toThrow(
      "ai.endpoint.endpoint-7.metadata: expected a JSON object",
    );
  });

  it("rejects an API row whose rules parser boundary is malformed", async () => {
    const malformed = { ...apiRow(9), rules: { params: {} } };
    mockTransport.pagesByTable.set("api", [malformed]);

    await expect(aiModelService.fetchApis()).rejects.toThrow(
      "ai.api.api-9.rules.constraints: expected a JSON array",
    );
  });
});
