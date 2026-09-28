import reducer, {
  cleanedSegmentsLoaded,
  cleanedSegmentRemoved,
  conceptsLoaded,
  conceptItemRemoved,
  moduleSegmentsLoaded,
  moduleSegmentRemoved,
  rawSegmentsLoaded,
  rawSegmentRemoved,
  rawSegmentUpdated,
  type TranscriptStudioState,
} from "./slice";
import { liveRowUpdateAction } from "./realtimeRestore";
import type {
  CleanedSegment,
  ConceptItem,
  ModuleSegment,
  RawSegment,
} from "../types";

// A studio row restored from Trash reaches this tab as a realtime UPDATE whose
// deleted_at went back to null. The store had dropped the row when it was
// trashed, so the in-place `*Updated` patch found nothing and the row stayed
// invisible until a reload. These walk the real reducer the way the middleware
// drives it: load -> trash (removed) -> restore UPDATE -> the row is back.

const SID = "session-1";
const init = (): TranscriptStudioState =>
  reducer(undefined, { type: "@@init" });

const raw = (id: string, tStart: number): RawSegment =>
  ({ id, sessionId: SID, tStart, tEnd: tStart + 1, chunkIndex: tStart, text: id }) as unknown as RawSegment;
const cleaned = (id: string, tStart: number): CleanedSegment =>
  ({ id, sessionId: SID, tStart, tEnd: tStart + 1, text: id, processorKey: "clean", recordingSegmentId: null }) as unknown as CleanedSegment;
const concept = (id: string): ConceptItem =>
  ({ id, sessionId: SID, tStart: null, label: id }) as unknown as ConceptItem;
const moduleSeg = (id: string): ModuleSegment =>
  ({ id, sessionId: SID, tStart: null, payload: {} }) as unknown as ModuleSegment;

describe("studio realtime: a row restored from Trash reappears without a reload", () => {
  test("the old in-place patch leaves a restored raw segment missing (the defect)", () => {
    let s = reducer(init(), rawSegmentsLoaded({ sessionId: SID, segments: [raw("a", 0), raw("b", 5)] }));
    s = reducer(s, rawSegmentRemoved({ sessionId: SID, segmentId: "a" }));
    s = reducer(s, rawSegmentUpdated({ sessionId: SID, segment: raw("a", 0) }));
    expect(s.rawIdsBySession[SID]).toEqual(["b"]);
  });

  test("raw segment comes back in tStart order", () => {
    let s = reducer(init(), rawSegmentsLoaded({ sessionId: SID, segments: [raw("a", 0), raw("b", 5)] }));
    s = reducer(s, rawSegmentRemoved({ sessionId: SID, segmentId: "a" }));
    s = reducer(s, liveRowUpdateAction(s, SID, { kind: "raw", item: raw("a", 0) }));
    expect(s.rawIdsBySession[SID]).toEqual(["a", "b"]);
    expect(s.rawById[SID]?.a).toBeDefined();
  });

  test("cleaned segment comes back without superseding the rows after it", () => {
    let s = reducer(init(), cleanedSegmentsLoaded({ sessionId: SID, segments: [cleaned("c1", 0), cleaned("c2", 10)] }));
    s = reducer(s, cleanedSegmentRemoved({ sessionId: SID, segmentId: "c1" }));
    s = reducer(s, liveRowUpdateAction(s, SID, { kind: "cleaned", item: cleaned("c1", 0) }));
    expect(s.cleanedIdsBySession[SID]).toEqual(["c1", "c2"]);
  });

  test("concept item and module segment come back", () => {
    let s = reducer(init(), conceptsLoaded({ sessionId: SID, items: [concept("k1"), concept("k2")] }));
    s = reducer(s, moduleSegmentsLoaded({ sessionId: SID, segments: [moduleSeg("m1")] }));
    s = reducer(s, conceptItemRemoved({ sessionId: SID, itemId: "k1" }));
    s = reducer(s, moduleSegmentRemoved({ sessionId: SID, segmentId: "m1" }));
    s = reducer(s, liveRowUpdateAction(s, SID, { kind: "concept", item: concept("k1") }));
    s = reducer(s, liveRowUpdateAction(s, SID, { kind: "module", item: moduleSeg("m1") }));
    expect(s.conceptIdsBySession[SID]).toContain("k1");
    expect(s.moduleSegmentIdsBySession[SID]).toEqual(["m1"]);
  });

  test("an edit to a held row stays an in-place patch (no duplicate)", () => {
    let s = reducer(init(), rawSegmentsLoaded({ sessionId: SID, segments: [raw("a", 0)] }));
    const edited = { ...raw("a", 0), text: "edited" } as RawSegment;
    s = reducer(s, liveRowUpdateAction(s, SID, { kind: "raw", item: edited }));
    expect(s.rawIdsBySession[SID]).toEqual(["a"]);
    expect((s.rawById[SID]?.a as unknown as { text: string }).text).toBe("edited");
  });
});
