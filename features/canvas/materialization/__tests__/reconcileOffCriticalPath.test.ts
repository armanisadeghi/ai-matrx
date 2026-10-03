/**
 * The reload safety net never scans inside the conversation-load task and
 * never holds the main thread longer than one slice.
 *
 * Since 0bb1455615 it runs the block splitter on EVERY assistant message on
 * load (measured 14–38 ms for 835–874 messages, one synchronous block in the
 * load thunk). Both tests failed on that code: the whole scan ran before
 * `reconcileSourceBlocks` returned its promise, in one uninterrupted block.
 */
const materializeBlocks = jest.fn();
jest.mock("../materializeBlocks", () => ({ materializeBlocks }));

const planMaterialization = jest.fn();
jest.mock("../planMaterialization", () => ({
  planMaterialization: (...args: unknown[]) => planMaterialization(...args),
}));

import { reconcileSourceBlocks, RECONCILE_SLICE_MS } from "../reconcileArtifacts";

const COST_MS = 1;
const MESSAGES = 200;

function busyWait(ms: number) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    /* simulate the splitter's cost per message */
  }
}

const items = Array.from({ length: MESSAGES }, (_, i) => ({
  source: { system: "cx_message" as const, id: `m-${i}`, conversationId: "c" },
  content: [{ type: "text", text: `message ${i}` }],
}));

beforeEach(() => {
  planMaterialization.mockReset();
  planMaterialization.mockImplementation(() => {
    busyWait(COST_MS);
    return { hasChanges: false, materializedArtifactIds: [] };
  });
});

describe("reconcileSourceBlocks — off the critical path", () => {
  it("scans nothing inside the caller's task", async () => {
    const pending = reconcileSourceBlocks(items);
    expect(planMaterialization).toHaveBeenCalledTimes(0);
    await pending;
    expect(planMaterialization).toHaveBeenCalledTimes(MESSAGES);
  });

  it("gives the main thread back between slices", async () => {
    // Record the longest stretch with no macrotask able to run.
    let longest = 0;
    let last = performance.now();
    let ticking = true;
    const tick = () => {
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
      if (ticking) setTimeout(tick, 0);
    };
    setTimeout(tick, 0);

    await reconcileSourceBlocks(items);
    // Let the pending tick land, so a scan that never yielded is measured too.
    await new Promise((resolve) => setTimeout(resolve, 0));
    ticking = false;

    // 200 messages × 1 ms = ~200 ms of scan; no single block may hold it.
    expect(longest).toBeLessThan(RECONCILE_SLICE_MS + COST_MS * 10);
  });
});
