/**
 * THE ONE LOADING SEQUENCE, as measured by the batch stream checker.
 *
 * Each case here is a false positive the checker actually produced on its
 * first full run over 484 live kinds (2026-08-25). They are pinned because a
 * checker that cries wolf is worse than no checker — it trains everyone to
 * ignore the board.
 */

import {
  deriveLoadingVerdicts,
  frameRendersRealComponent,
  type StreamTickRecord,
} from "../studio/stream-simulator";

const KIND = "demo_kind";

function frame(
  over: Partial<StreamTickRecord> & { chunk: number },
): StreamTickRecord {
  return {
    blockId: "client_block_1",
    type: "code",
    status: "streaming",
    envelope: { kind: KIND, kindState: null, status: "streaming", valueChars: 10 },
    rawKindTextVisible: false,
    ...over,
  } as StreamTickRecord;
}

describe("deriveLoadingVerdicts", () => {
  it("loader frames, then the real component, and the loader never returns", () => {
    const records = [
      frame({ chunk: 1, routed: { type: "code", hasServerData: false } }),
      frame({ chunk: 2, routed: { type: "code", hasServerData: false } }),
      frame({ chunk: 3, routed: { type: "quiz", hasServerData: true } }),
      frame({ chunk: 4, routed: { type: "quiz", hasServerData: true } }),
    ];
    const v = deriveLoadingVerdicts(records, KIND);
    expect(v.loaderShownFirst).toBe(true);
    expect(v.firstUnitChunk).toBe(3);
    expect(v.realComponentWhileStreaming).toBe(true);
    expect(v.loaderNeverReturns).toBe(true);
  });

  it("catches a REAL flicker — a loader frame after the same block rendered", () => {
    const records = [
      frame({ chunk: 1, routed: { type: "quiz", hasServerData: true } }),
      frame({ chunk: 2, routed: { type: "code", hasServerData: false } }),
    ];
    expect(deriveLoadingVerdicts(records, KIND).loaderNeverReturns).toBe(false);
  });

  it("FALSE POSITIVE 1 — a second block's loader is not the first block's flicker", () => {
    // A bare-JSON example routinely yields the structured block plus trailing
    // text. Blocks stream independently; B still loading while A has rendered
    // is correct. Comparing across blocks invented 27 failures.
    const records = [
      frame({ chunk: 1, blockId: "client_block_1", routed: { type: "quiz", hasServerData: true } }),
      frame({ chunk: 2, blockId: "client_block_2", routed: { type: "code", hasServerData: false } }),
      frame({ chunk: 3, blockId: "client_block_2", routed: { type: "code", hasServerData: false } }),
    ];
    expect(deriveLoadingVerdicts(records, KIND).loaderNeverReturns).toBe(true);
  });

  it("FALSE POSITIVE 2 — an envelope-less frame is never the kind's first unit", () => {
    // An unrelated block whose `data` is an empty object routed with
    // `serverData !== undefined` and read as "rendered at chunk 1", before a
    // byte of JSON existed.
    const records = [
      frame({ chunk: 1, envelope: null, routed: { type: "text", hasServerData: true } }),
      frame({ chunk: 2, routed: { type: "code", hasServerData: false } }),
      frame({ chunk: 3, routed: { type: "quiz", hasServerData: true } }),
    ];
    const v = deriveLoadingVerdicts(records, KIND);
    expect(v.firstUnitChunk).toBe(3);
    expect(v.loaderShownFirst).toBe(true);
  });

  it("FALSE POSITIVE 3 — a DB-authored component renders WITHOUT serverData", () => {
    // The route deliberately clears serverData for `db_kind_component` (the
    // component parses `content` itself). Reading serverData alone marked
    // every DB-authored kind as never rendering.
    const records = [
      frame({ chunk: 1, routed: { type: "code", hasServerData: false } }),
      frame({ chunk: 2, routed: { type: "db_kind_component", hasServerData: false } }),
    ];
    const v = deriveLoadingVerdicts(records, KIND);
    expect(v.realComponentWhileStreaming).toBe(true);
    expect(v.firstUnitChunk).toBe(2);
    expect(v.loaderNeverReturns).toBe(true);
  });

  it("the generic fallback is NOT the kind's component", () => {
    expect(
      frameRendersRealComponent(
        frame({ chunk: 1, routed: { type: "generic_structured", hasServerData: false } }),
      ),
    ).toBe(false);
    expect(
      frameRendersRealComponent(
        frame({ chunk: 1, routed: { type: "db_kind_component", hasServerData: false } }),
      ),
    ).toBe(true);
  });

  it("a kind that never renders live is reported as such", () => {
    const records = [
      frame({ chunk: 1, routed: { type: "code", hasServerData: false } }),
      frame({ chunk: 2, routed: { type: "code", hasServerData: false } }),
    ];
    const v = deriveLoadingVerdicts(records, KIND);
    expect(v.realComponentWhileStreaming).toBe(false);
    expect(v.firstUnitChunk).toBeNull();
  });
});
