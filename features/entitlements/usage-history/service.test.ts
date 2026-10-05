import { fetchPersonalUsageHistory } from "./service";
import { USAGE_HISTORY_PAGE_SIZE } from "./types";

function clientWith(calls: Array<[string, unknown?]>, auth: { user: { id: string } | null; error?: Error | null }) {
  const request = {
    select: jest.fn(() => request),
    eq: jest.fn((...args: [string, unknown]) => { calls.push(args); return request; }),
    is: jest.fn((...args: [string, unknown]) => { calls.push(args); return request; }),
    lte: jest.fn((...args: [string, unknown]) => { calls.push(args); return request; }),
    gte: jest.fn((...args: [string, unknown]) => { calls.push(args); return request; }),
    or: jest.fn((...args: [string]) => { calls.push(args); return request; }),
    order: jest.fn((...args: [string, unknown]) => { calls.push(args); return request; }),
    limit: jest.fn(async (limit: number) => { calls.push(["limit", limit]); return { data: [], error: null }; }),
  };
  return {
    auth: { getUser: async () => ({ data: { user: auth.user }, error: auth.error ?? null }) },
    schema: jest.fn(() => ({ from: jest.fn(() => request) })),
  };
}

describe("fetchPersonalUsageHistory", () => {
  it("uses the signed-in creator, fixed snapshot, and descending keyset cursor", async () => {
    const calls: Array<[string, unknown?]> = [];
    const client = clientWith(calls, { user: { id: "member-harbor" } });
    await fetchPersonalUsageHistory(
      { range: "7d", activity: "executions", page: 1, snapshotAt: "2026-10-04T12:00:00.000Z", cursor: { createdAt: "2026-10-03T12:00:00.000Z", id: "ledger-harbor-20" } },
      { now: new Date("2026-10-05T12:00:00.000Z"), client: client as never },
    );
    expect(calls).toContainEqual(["created_by", "member-harbor"]);
    expect(calls).toContainEqual(["created_at", "2026-10-04T12:00:00.000Z"]);
    expect(calls).toContainEqual(["created_at.lt.2026-10-03T12:00:00.000Z,and(created_at.eq.2026-10-03T12:00:00.000Z,id.lt.ledger-harbor-20)"]);
    expect(calls).toContainEqual(["limit", USAGE_HISTORY_PAGE_SIZE + 1]);
  });

  it("refuses an absent authenticated person before querying the ledger", async () => {
    const calls: Array<[string, unknown?]> = [];
    const client = clientWith(calls, { user: null, error: new Error("session expired") });
    await expect(fetchPersonalUsageHistory(
      { range: "all", activity: "all", page: 0, snapshotAt: null, cursor: null },
      { client: client as never },
    )).rejects.toThrow("Sign in to view usage history.");
    expect(calls).toEqual([]);
  });
});
