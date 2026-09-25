/**
 * LANE PANEL-REMOUNT (2026-09-24) — the same organization gets the same live-updates port.
 *
 * `<RecordsProvider>` (from `@ai-matrx/records/react`) rebuilds its records client whenever
 * `config.realtime` changes identity, and every grid hook re-reads on a new client. The
 * /data-v2 pages build this port inline in `config`, so a fresh object per call meant that ANY
 * re-render of the page — a window panel writing `?panels=`, a `?view=` change — re-read
 * `table_kernel_id`, `applicable_fields`, `my_levels`, … and redrew every row. Measured
 * headless on the shared preview: a bare `history.replaceState` to `?probe=1` fired nine grid
 * RPCs before this, zero after.
 *
 * RED on the previous bytes: `expect(second).toBe(first)` — two calls returned two objects.
 */
jest.mock("@ai-matrx/realtime", () => ({
  defineChannelNamespace: () => ({ topic: () => "topic" }),
  subscribeToRealtimeManager: () => () => undefined,
}));
jest.mock("@/lib/knobs/unifiedDataCampaign", () => ({
  UNIFIED_DATA_CAMPAIGN: { enabled: async () => true },
}));

import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";

describe("createRecordsRealtimePort", () => {
  it("returns the same port for the same organization, so a page re-render is not a new records client", () => {
    const first = createRecordsRealtimePort("9f0c1d7e-5b8a-4c2e-a1f3-3d6e8b2c4a10");
    const second = createRecordsRealtimePort("9f0c1d7e-5b8a-4c2e-a1f3-3d6e8b2c4a10");
    expect(second).toBe(first);
  });

  it("returns a different port for a different organization", () => {
    const rincon = createRecordsRealtimePort("9f0c1d7e-5b8a-4c2e-a1f3-3d6e8b2c4a10");
    const other = createRecordsRealtimePort("2b7e4f19-8c3d-4a6b-9e1f-7d5c3a2b1e08");
    expect(other).not.toBe(rincon);
  });
});
