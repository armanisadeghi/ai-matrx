import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { UsageHistory } from "./UsageHistory";
import { fetchPersonalUsageHistory } from "./service";
import { USAGE_HISTORY_PAGE_SIZE, toUsageHistoryEntry } from "./types";

jest.mock("./service", () => ({ fetchPersonalUsageHistory: jest.fn() }));

const readHistory = fetchPersonalUsageHistory as jest.MockedFunction<typeof fetchPersonalUsageHistory>;

describe("personal usage history", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    readHistory.mockReset();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("keeps malformed quantities unknown and preserves recorded failed outcomes", () => {
    const entry = toUsageHistoryEntry({
      id: "ledger-harbor-1",
      created_at: "2026-10-04T12:00:00.000Z",
      quantity: Number.NaN,
      metadata: { execution_type: "agent_run", status: "failed" },
    } as never);
    expect(entry).toMatchObject({ quantity: null, activity: "Agent Run", outcome: "Failed" });
  });

  it("queries the caller's ledger with a stable extra-row page boundary", async () => {
    const calls: Array<[string, unknown?]> = [];
    const request = {
      select: jest.fn(() => request),
      eq: jest.fn((...args: [string, unknown]) => { calls.push(args); return request; }),
      is: jest.fn((...args: [string, unknown]) => { calls.push(args); return request; }),
      gte: jest.fn((...args: [string, unknown]) => { calls.push(args); return request; }),
      order: jest.fn((...args: [string, unknown]) => { calls.push(args); return request; }),
      range: jest.fn(async (from: number, to: number) => {
        calls.push(["range", [from, to]]);
        return { data: [], error: null };
      }),
    };
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: "member-harbor" } } }) },
      schema: jest.fn(() => ({ from: jest.fn(() => request) })),
    };

    await fetchPersonalUsageHistory(
      { range: "7d", activity: "executions", page: 1 },
      { now: new Date("2026-10-04T12:00:00.000Z"), client: client as never },
    );

    expect(calls).toContainEqual(["created_by", "member-harbor"]);
    expect(calls).toContainEqual(["capability", "platform.points"]);
    expect(calls).toContainEqual(["deleted_at", null]);
    expect(calls).toContainEqual(["metadata->>source", "runtime.global_execution"]);
    expect(calls).toContainEqual(["range", [USAGE_HISTORY_PAGE_SIZE, USAGE_HISTORY_PAGE_SIZE * 2]]);
    expect(calls).toContainEqual(["created_at", { ascending: false }]);
    expect(calls).toContainEqual(["id", { ascending: false }]);
  });

  it("renders an honest empty state", async () => {
    readHistory.mockResolvedValue({ entries: [], page: 0, hasNextPage: false });
    await act(async () => { root.render(<UsageHistory />); });
    await act(async () => {});
    expect(host.textContent).toContain("No activity in this interval.");
  });

  it("maps the next control to a new server page", async () => {
    readHistory
      .mockResolvedValueOnce({ entries: [{ id: "ledger-harbor-1", createdAt: "2026-10-04T12:00:00.000Z", quantity: 120, activity: "Agent Run", outcome: "Completed" }], page: 0, hasNextPage: true })
      .mockResolvedValueOnce({ entries: [{ id: "ledger-harbor-2", createdAt: "2026-10-03T12:00:00.000Z", quantity: -25, activity: "Agent Run", outcome: "Completed" }], page: 1, hasNextPage: false });
    await act(async () => { root.render(<UsageHistory />); });
    await act(async () => {});
    expect(host.textContent).toContain("−120 points");
    const next = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Next"));
    expect(next).toBeDefined();
    await act(async () => { next?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(readHistory).toHaveBeenLastCalledWith({ range: "30d", activity: "all", page: 1 });
    expect(host.textContent).toContain("+25 points");
  });
});
