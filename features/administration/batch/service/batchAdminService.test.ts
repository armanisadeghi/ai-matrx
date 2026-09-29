import { listWorkItems } from "./batchAdminService";

const mockCalls: Array<{ method: string; args: unknown[] }> = [];
let mockResult: { data: null; error: null; count: number | null } = {
  data: null,
  error: null,
  count: 0,
};

function record(method: string, args: unknown[]) {
  mockCalls.push({ method, args });
}

function makeQuery() {
  const query = {
    select(...args: unknown[]) {
      record("select", args);
      return query;
    },
    eq(...args: unknown[]) {
      record("eq", args);
      return query;
    },
    is(...args: unknown[]) {
      record("is", args);
      return query;
    },
    lte(...args: unknown[]) {
      record("lte", args);
      return query;
    },
    or(...args: unknown[]) {
      record("or", args);
      return query;
    },
    order(...args: unknown[]) {
      record("order", args);
      return query;
    },
    range(...args: unknown[]) {
      record("range", args);
      return query;
    },
    abortSignal(...args: unknown[]) {
      record("abortSignal", args);
      return query;
    },
    then<T>(
      onfulfilled?: ((value: typeof mockResult) => T | PromiseLike<T>) | null,
      onrejected?: ((reason: unknown) => T | PromiseLike<T>) | null,
    ) {
      return Promise.resolve(mockResult).then(onfulfilled, onrejected);
    },
  };
  return query;
}

const mockQuery = makeQuery();

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => mockQuery,
    }),
  }),
}));

describe("listWorkItems source paging", () => {
  beforeEach(() => {
    mockCalls.length = 0;
    mockResult = { data: null, error: null, count: 31 };
  });

  it("anchors, orders, and ranges a single exact-count source query", async () => {
    await listWorkItems(
      { status: "completed" },
      { page: 2, pageSize: 25, asOf: "2026-09-28T12:00:00.000Z" },
    );

    expect(mockCalls).toContainEqual({
      method: "select",
      args: [expect.any(String), { count: "exact" }],
    });
    expect(mockCalls).toContainEqual({
      method: "lte",
      args: ["created_at", "2026-09-28T12:00:00.000Z"],
    });
    expect(mockCalls.filter((call) => call.method === "order")).toEqual([
      { method: "order", args: ["created_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: true }] },
    ]);
    expect(mockCalls).toContainEqual({ method: "range", args: [25, 49] });
  });

  it("fails instead of substituting a page length when the exact count is unavailable", async () => {
    mockResult = { data: null, error: null, count: null };

    await expect(listWorkItems()).rejects.toThrow(
      "source did not return an exact count",
    );
  });
});
