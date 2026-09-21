/**
 * The conversation-scoped pending-call read is SINGLE-FLIGHT.
 *
 * SUT: `fetchConversationPendingCalls` / `fetchConversationPendingCallsStrict`
 * in `features/agents/api/fetch-pending-calls.ts`. They OWN: never putting two
 * identical GETs for one conversation on the wire at the same moment, handing
 * every joiner the same answer, keeping DIFFERENT conversations independent,
 * and dropping the entry the instant it settles so the next tick is a fresh
 * read and never a cached one.
 *
 * Real: the thunks and their single-flight map. Replaced: only `callApi`, the
 * network seam, which counts calls and resolves on a gate this test opens.
 *
 * WHY THIS IS A GUARD AND NOT A NICETY. One `watchDesktopDelegation` loop runs
 * per pending `local_*` call, and they all read the SAME row set. Measured on
 * an idle `/staff` carrying three stale calls (2026-09-21): 192 GETs a minute
 * to production aidream. Every assertion below fails without the coalescing —
 * the counts are exactly the number of callers instead of one.
 */

const mockCallApi = jest.fn();

jest.mock("@/lib/api/call-api", () => ({
  callApi: (config: unknown) => {
    mockCallApi(config);
    return async () => mockNextResponse();
  },
}));

let mockNextResponse: () => Promise<{ data?: unknown; error?: unknown }>;

import {
  __resetPendingCallReadsForTests,
  fetchConversationPendingCalls,
  fetchConversationPendingCallsStrict,
} from "../fetch-pending-calls";

const CONVERSATION_A = "11111111-1111-4111-8111-111111111111";
const CONVERSATION_B = "22222222-2222-4222-8222-222222222222";

/** A dispatch that just runs the thunk, which is all these thunks need. */
const dispatch = ((thunk: unknown) =>
  typeof thunk === "function"
    ? (thunk as (d: unknown, g: unknown) => unknown)(dispatch, () => ({}))
    : thunk) as never;

/** A response nobody can resolve until the test says so. */
function gate() {
  let release!: (rows: unknown[]) => void;
  const held = new Promise<{ data: unknown[] }>((resolve) => {
    release = (rows) => resolve({ data: rows });
  });
  mockNextResponse = () => held;
  return release;
}

beforeEach(() => {
  mockCallApi.mockClear();
  __resetPendingCallReadsForTests();
  mockNextResponse = async () => ({ data: [] });
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  __resetPendingCallReadsForTests();
  jest.restoreAllMocks();
});

describe("the conversation pending-call read", () => {
  it("puts ONE request on the wire for three simultaneous callers", async () => {
    const release = gate();

    // Three watchers ticking together, exactly as three stale `local_*` calls
    // in one conversation do.
    const reads = Promise.all([
      dispatch(fetchConversationPendingCallsStrict(CONVERSATION_A)),
      dispatch(fetchConversationPendingCallsStrict(CONVERSATION_A)),
      dispatch(fetchConversationPendingCalls(CONVERSATION_A)),
    ]);
    await Promise.resolve();

    expect(mockCallApi).toHaveBeenCalledTimes(1);

    release([{ call_id: "toolu_1" }]);
    // And every joiner gets the real answer — coalescing is not swallowing.
    for (const rows of await reads) {
      expect(rows).toEqual([{ call_id: "toolu_1" }]);
    }
  });

  it("never coalesces DIFFERENT conversations", async () => {
    gate();

    void dispatch(fetchConversationPendingCallsStrict(CONVERSATION_A));
    void dispatch(fetchConversationPendingCallsStrict(CONVERSATION_B));
    await Promise.resolve();

    expect(mockCallApi).toHaveBeenCalledTimes(2);
  });

  it("is single-flight, NOT a cache — the next tick reads the ledger again", async () => {
    mockNextResponse = async () => ({ data: [] });

    await dispatch(fetchConversationPendingCallsStrict(CONVERSATION_A));
    await dispatch(fetchConversationPendingCallsStrict(CONVERSATION_A));

    // A stale row set is how a resumed turn wedges. Two sequential ticks are
    // two reads, always.
    expect(mockCallApi).toHaveBeenCalledTimes(2);
  });

  it("frees the slot after a REJECTED read, so a recovered server is asked again", async () => {
    mockNextResponse = async () => ({ error: { message: "upstream down" } });

    await expect(
      dispatch(fetchConversationPendingCallsStrict(CONVERSATION_A)),
    ).rejects.toThrow("upstream down");

    mockNextResponse = async () => ({ data: [{ call_id: "toolu_2" }] });
    await expect(
      dispatch(fetchConversationPendingCallsStrict(CONVERSATION_A)),
    ).resolves.toEqual([{ call_id: "toolu_2" }]);
    expect(mockCallApi).toHaveBeenCalledTimes(2);
  });
});
