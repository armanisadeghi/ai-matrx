const inCalls = jest.fn();

jest.mock("../host/db", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          in: inCalls,
        }),
      }),
    }),
  }),
}));

jest.mock("@host/lib/supabase/hasBrowserSession", () => ({
  hasBrowserSession: () => Promise.resolve(true),
}));
// The identity seam (P7) carries the names this test stood in for above; the rest stay real.
jest.mock("../host/identity", () => {
  const standIns: Record<string, unknown> = {
    ...(() => ({
  hasBrowserSession: () => Promise.resolve(true),
}))(),
  };
  const moved = ["selectUserId","selectIsAuthenticated","selectIsAdmin","selectIsSuperAdmin","getUserId","requireUserId","NotAuthenticatedError","isNotAuthenticatedError","hasBrowserSession"];
  return {
    ...jest.requireActual("../host/identity"),
    ...Object.fromEntries(Object.entries(standIns).filter(([name]) => moved.includes(name))),
  };
});

import {
  fetchAgentOutputSchemas,
  invalidateOutputSchemaCache,
} from "./output-contract";

describe("fetchAgentOutputSchemas", () => {
  beforeEach(() => {
    invalidateOutputSchemaCache();
    inCalls.mockReset();
  });

  it("deduplicates overlapping cold reads for the same bound agent", async () => {
    let resolveQuery:
      | ((value: { data: Array<Record<string, unknown>>; error: null }) => void)
      | undefined;
    inCalls.mockReturnValue(
      new Promise<{ data: Array<Record<string, unknown>>; error: null }>(
        (resolve) => {
          resolveQuery = resolve;
        },
      ),
    );

    const first = fetchAgentOutputSchemas(["agent-1"]);
    const second = fetchAgentOutputSchemas(["agent-1"]);
    // The read waits for the (local) session check before it is issued.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(inCalls).toHaveBeenCalledTimes(1);

    resolveQuery?.({
      data: [
        {
          id: "agent-1",
          output_schema: { schema: { properties: { answer: {} } } },
        },
      ],
      error: null,
    });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { "agent-1": { schema: { properties: { answer: {} } } } },
      { "agent-1": { schema: { properties: { answer: {} } } } },
    ]);
  });

  it("clears a failed in-flight read so a later mount retries once", async () => {
    inCalls
      .mockResolvedValueOnce({ data: null, error: { message: "offline" } })
      .mockResolvedValueOnce({
        data: [
          {
            id: "agent-1",
            output_schema: { schema: { properties: { answer: {} } } },
          },
        ],
        error: null,
      });
    await expect(fetchAgentOutputSchemas(["agent-1"])).resolves.toEqual({});
    await expect(fetchAgentOutputSchemas(["agent-1"])).resolves.toEqual({
      "agent-1": { schema: { properties: { answer: {} } } },
    });
    expect(inCalls).toHaveBeenCalledTimes(2);
  });
});
