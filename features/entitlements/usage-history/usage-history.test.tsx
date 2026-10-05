import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { UsageHistory } from "./UsageHistory";
import { fetchPersonalUsageHistory } from "./service";
import { toUsageHistoryEntry } from "./types";

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
