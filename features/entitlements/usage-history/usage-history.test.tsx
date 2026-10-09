import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { UsageHistory } from "./UsageHistory";
import { fetchPersonalUsageHistory } from "./service";
import { toUsageHistoryEntry, usageActivityLabel } from "./types";

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
    readHistory.mockResolvedValue({ entries: [], snapshotAt: "2026-10-04T12:00:00.000Z", nextCursor: null });
    await act(async () => { root.render(<UsageHistory />); });
    await act(async () => {});
    expect(host.textContent).toContain("No activity in this interval.");
  });

  it("maps the next control to a new server page", async () => {
    readHistory
      .mockResolvedValueOnce({ entries: [{ id: "ledger-harbor-1", createdAt: "2026-10-04T12:00:00.000Z", quantity: 120, activity: "Agent Run", outcome: "Completed" }], snapshotAt: "2026-10-04T12:00:00.000Z", nextCursor: { createdAt: "2026-10-04T12:00:00.000Z", id: "ledger-harbor-1" } })
      .mockResolvedValueOnce({ entries: [{ id: "ledger-harbor-2", createdAt: "2026-10-03T12:00:00.000Z", quantity: -25, activity: "Agent Run", outcome: "Completed" }], snapshotAt: "2026-10-04T12:00:00.000Z", nextCursor: null });
    await act(async () => { root.render(<UsageHistory />); });
    await act(async () => {});
    expect(host.textContent).toContain("−120 points");
    const next = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Next"));
    expect(next).toBeDefined();
    await act(async () => { next?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(readHistory).toHaveBeenLastCalledWith({ range: "30d", activity: "all", page: 1, snapshotAt: "2026-10-04T12:00:00.000Z", cursor: { createdAt: "2026-10-04T12:00:00.000Z", id: "ledger-harbor-1" } });
    expect(host.textContent).toContain("+25 points");
  });
});


describe("usageActivityLabel", () => {
  it("shows the label the server wrote, subject included", () => {
    expect(usageActivityLabel({ activity: "Social data · Tracked @jeffnippard (Instagram)", link_kind: "external_api" }))
      .toBe("Social data · Tracked @jeffnippard (Instagram)");
  });
  it("older hard-cost rows with no label get a plain category, not a vendor", () => {
    expect(usageActivityLabel({ link_kind: "external_api" })).toBe("Data service");
    expect(usageActivityLabel({ activity: "ScrapeCreators", link_kind: "external_api" })).toBe("Data service");
  });
  it("model rows keep the humanized execution type", () => {
    expect(usageActivityLabel({ execution_type: "agent_run" })).toBe("Agent Run");
  });
});
