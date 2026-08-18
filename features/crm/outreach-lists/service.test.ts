interface MockResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

type QueryCall = { method: string; args: unknown[] };

const queryState: { result: MockResult; calls: QueryCall[] } = {
  result: { data: null, error: null },
  calls: [],
};

function queryBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = (method: string) =>
    jest.fn((...args: unknown[]) => {
      queryState.calls.push({ method, args });
      return builder;
    });
  builder.select = chain("select");
  builder.eq = chain("eq");
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

import { fetchOutreachList } from "./service";

const LIST_ID = "a552b78d-c68c-4e7c-9efa-f1163c5e850e";

beforeEach(() => {
  jest.clearAllMocks();
  queryState.calls = [];
  queryState.result = { data: null, error: null };
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
