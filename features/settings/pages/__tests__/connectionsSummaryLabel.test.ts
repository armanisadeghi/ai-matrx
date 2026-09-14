import { connectionsSummaryLabel } from "../IntegrationsSettingsPage";

/**
 * Regression guard for the cold-/chat-adjacent-page defect (2026-09-14):
 * the "Your connections" section summary read "Nothing connected yet" while
 * `GitHubConnectionCard`, rendered directly below it in the same section,
 * was still showing "Loading GitHub account…" — a loading surface and its
 * own empty verdict on screen at the same time. The rule this guards: the
 * empty sentence is earned only by "no items AND nothing still loading".
 */
describe("connectionsSummaryLabel", () => {
  it("never claims 'Nothing connected yet' while a contributing source is still loading, even with zero items", () => {
    const label = connectionsSummaryLabel(/* stillLoading */ true, /* totalConnected */ 0);
    expect(label).not.toBe("Nothing connected yet");
    expect(label).toBe("Checking connections…");
  });

  it("shows the real empty state once every source has answered and nothing is connected", () => {
    expect(connectionsSummaryLabel(false, 0)).toBe("Nothing connected yet");
  });

  it("shows the active count once loaded, never a loading word", () => {
    expect(connectionsSummaryLabel(false, 3)).toBe("3 active");
  });

  it("prefers the loading state over a count that has already arrived from one source but not another", () => {
    // e.g. the MCP catalog already answered "1 connected" but GitHub or
    // Google are still in flight — still not the final truth.
    expect(connectionsSummaryLabel(true, 1)).toBe("Checking connections…");
  });
});
