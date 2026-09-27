interface MockResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

type QueryCall = { method: string; args: unknown[] };

const queryState: { result: MockResult; calls: QueryCall[] } = {
  result: { data: null, error: null },
  calls: [],
};
let pagedRows: { id: string }[] | null = null;

function queryBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = (method: string) =>
    jest.fn((...args: unknown[]) => {
      queryState.calls.push({ method, args });
      return builder;
    });
  builder.select = chain("select");
  builder.eq = chain("eq");
  builder.is = chain("is");
  builder.or = chain("or");
  builder.order = chain("order");
  builder.range = jest.fn((from: number, to: number) => {
    queryState.calls.push({ method: "range", args: [from, to] });
    return Promise.resolve({
      data: pagedRows?.slice(from, to + 1) ?? [],
      error: null,
      count: pagedRows?.length ?? 0,
    });
  });
  builder.maybeSingle = jest.fn(() => {
    queryState.calls.push({ method: "maybeSingle", args: [] });
    return Promise.resolve(queryState.result);
  });
  return builder;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: jest.fn((schema: string) => ({
      from: jest.fn((table: string) => {
        queryState.calls.push({ method: "from", args: [schema, table] });
        return queryBuilder();
      }),
    })),
  },
}));

import { fetchOutreachList, fetchOutreachLists } from "./service";

const LIST_ID = "a552b78d-c68c-4e7c-9efa-f1163c5e850e";

beforeEach(() => {
  jest.clearAllMocks();
  queryState.calls = [];
  queryState.result = { data: null, error: null };
  pagedRows = null;
});

describe("fetchOutreachLists", () => {
  it("reads the entire authorized, ordered list beyond the database's first 1000 rows", async () => {
    pagedRows = Array.from({ length: 1001 }, (_, index) => ({ id: String(index) }));

    const rows = await fetchOutreachLists({
      userId: "user-1",
      orgIds: ["org-1"],
      orgNames: { "org-1": "One" },
    });

    expect(rows).toHaveLength(1001);
    expect(queryState.calls.filter((call) => call.method === "range")).toEqual([
      { method: "range", args: [0, 999] },
      { method: "range", args: [1000, 1999] },
    ]);
    expect(queryState.calls.filter((call) => call.method === "select")).toEqual([
      { method: "select", args: ["*, members:outreach_list_member(count)", { count: "exact" }] },
      { method: "select", args: ["*, members:outreach_list_member(count)", { count: "exact" }] },
    ]);
    expect(queryState.calls.filter((call) => call.method === "or")).toEqual([
      { method: "or", args: ["created_by.eq.user-1,organization_id.in.(org-1)"] },
      { method: "or", args: ["created_by.eq.user-1,organization_id.in.(org-1)"] },
    ]);
    expect(queryState.calls.filter((call) => call.method === "order")).toEqual([
      { method: "order", args: ["updated_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: true }] },
      { method: "order", args: ["updated_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: true }] },
    ]);
  });
});

describe("fetchOutreachList", () => {
  it("turns a zero-row read into the canonical access-state error", async () => {
    await expect(fetchOutreachList(LIST_ID)).rejects.toMatchObject({
      name: "RecordUnavailableError",
      token: "crm_outreach_list",
      recordId: LIST_ID,
    });

    expect(queryState.calls).toEqual([
      { method: "from", args: ["crm", "outreach_list"] },
      { method: "select", args: ["*"] },
      { method: "eq", args: ["id", LIST_ID] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("returns the row when it is readable", async () => {
    const row = { id: LIST_ID, name: "Prospects" };
    queryState.result = { data: row, error: null };

    await expect(fetchOutreachList(LIST_ID)).resolves.toBe(row);
  });

  it("keeps real PostgREST failures loud", async () => {
    queryState.result = {
      data: null,
      error: { message: "gateway failed", code: "PGRST500" },
    };

    await expect(fetchOutreachList(LIST_ID)).rejects.toThrow(
      "gateway failed (PGRST500)",
    );
  });
});
