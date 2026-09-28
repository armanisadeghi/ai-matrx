/**
 * ONE CHANNEL PER TABLE, HOWEVER MANY READERS (merged-grid review 2, lane E, 2026-09-27).
 *
 * THE USE CASE: the Camarillo dispatcher opens the September service board. The grid, its
 * summaries, the export menu's page and the row-actions editor each read the same table — and the
 * review counted 124 `channel.raw.echo-unguarded` / `channel.raw.dedup-unguarded` warnings in one
 * session: every reader opened its own holder on `custom:table:<id>`, and each open announced a
 * raw wire with no echo test and no dedup key.
 *
 * RED on the previous bytes: two readers made two `subscribeToRealtimeManager` calls, and the spec
 * declared neither `wire.isOwnMessage` nor `eventKey`.
 */
const opened: Array<Record<string, unknown>> = [];
const stopped: number[] = [];
jest.mock("@ai-matrx/realtime", () => ({
  defineChannelNamespace: () => ({ topic: ({ tableId }: { tableId: string }) => `custom:table:${tableId}` }),
  subscribeToRealtimeManager: (spec: () => Record<string, unknown>) => {
    const index = opened.push(spec()) - 1;
    return () => stopped.push(index);
  },
}));
jest.mock("@/lib/knobs/unifiedDataCampaign", () => ({
  UNIFIED_DATA_CAMPAIGN: { enabled: async () => true },
}));
jest.mock("@ai-matrx/records", () => ({
  isOwnOp: (id: unknown) => id === "mine-op",
}));

import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";

const ORG = "5d1e7c2a-9b3f-4e8d-a6c1-2f0b9e7d4c31";
const BOARD = "3260bbbe-aaa8-4148-a4d9-7ad880e7976d";
const ROUTES = "7a41c0de-2b6f-4d3e-9c8a-1f5e0b4d2c67";
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function sink() {
  return { records: jest.fn(), shape: jest.fn() };
}

type Spec = {
  topic: string;
  wire: { mode: string; isOwnMessage?: (payload: unknown) => boolean };
  eventKey?: (source: string, payload: unknown) => string | undefined;
  broadcast: Array<{ onMessage: (message: { data: unknown }) => void }>;
};

describe("the record store's live port", () => {
  beforeEach(() => {
    opened.length = 0;
    stopped.length = 0;
    jest.useRealTimers();
  });

  it("opens ONE channel for a table however many readers subscribe, and closes it with the last", async () => {
    const port = createRecordsRealtimePort(ORG);
    const grid = sink();
    const exportPage = sink();
    const leaveGrid = port.subscribeRecords({ organization_id: ORG as never, table_id: BOARD as never }, grid);
    const leaveExport = port.subscribeRecords({ organization_id: ORG as never, table_id: BOARD as never }, exportPage);
    await flush();
    expect(opened).toHaveLength(1);
    expect(opened[0]!["topic"]).toBe(`custom:table:${BOARD}`);

    // One notice reaches both readers.
    jest.useFakeTimers();
    (opened[0] as unknown as Spec).broadcast[0]!.onMessage({
      data: { table_id: BOARD, kind: "record", op: "updated", op_id: null, record_ids: ["r-1"], at: "2026-09-27T17:00:00Z" },
    });
    jest.advanceTimersByTime(200);
    expect(grid.records).toHaveBeenCalledWith(["r-1"]);
    expect(exportPage.records).toHaveBeenCalledWith(["r-1"]);
    jest.useRealTimers();

    leaveGrid();
    // A reader leaving keeps the table's channel for the others…
    expect(stopped).toEqual([]);
    leaveExport();
    // …and the last reader closes it.
    expect(stopped).toEqual([0]);
  });

  it("declares its echo test and dedup key, so the raw wire is guarded rather than announced", async () => {
    const port = createRecordsRealtimePort(ORG);
    const leave = port.subscribeRecords({ organization_id: ORG as never, table_id: ROUTES as never }, sink());
    await flush();
    const spec = opened[0] as unknown as Spec;
    expect(spec.wire.mode).toBe("raw");
    expect(spec.wire.isOwnMessage?.({ op_id: "mine-op" })).toBe(true);
    expect(spec.wire.isOwnMessage?.({ op_id: null })).toBe(false);
    const notice = { table_id: BOARD, kind: "record", op: "updated", op_id: null, record_ids: ["b", "a"], at: "2026-09-27T17:00:00Z" };
    expect(spec.eventKey?.("broadcast", notice)).toBe(spec.eventKey?.("broadcast", { ...notice, record_ids: ["a", "b"] }));
    expect(spec.eventKey?.("broadcast", { ...notice, at: "2026-09-27T17:00:01Z" })).not.toBe(spec.eventKey?.("broadcast", notice));
    leave();
  });
});
