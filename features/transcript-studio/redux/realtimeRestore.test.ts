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
  recordingSegmentsLoaded,
  recordingSegmentRemoved,
  recordingSegmentUpserted,
  type TranscriptStudioState,
} from "./slice";
import { liveRowUpdateAction } from "./realtimeRestore";
import type {
  CleanedSegment,
  ConceptItem,
  ModuleSegment,
  RawSegment,
  RecordingSegment,
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
  ({ id, sessionId: SID, tStart: null, label: id, createdAt: "2026-09-28T01:00:00+00:00" }) as unknown as ConceptItem;
const moduleSeg = (id: string): ModuleSegment =>
  ({ id, sessionId: SID, tStart: null, payload: {}, createdAt: "2026-09-28T01:00:00+00:00" }) as unknown as ModuleSegment;

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

// A restored row must land where a reload would put it: at its position under
// the SAME sort key the initial load orders by (studioService list* `.order`):
// raw t_start (+ chunkIndex, the slice's tie-break), cleaned t_start, concept
// and module created_at, recording segment_index. Each case trashes a MIDDLE
// row and restores it; appending it at the end of the column is the defect.
describe("studio realtime: a restored row returns to its original position", () => {
  const at = (sec: number) => `2026-09-28T01:00:${String(sec).padStart(2, "0")}.123456+00:00`;
  const conceptAt = (id: string, sec: number): ConceptItem =>
    ({ ...concept(id), createdAt: at(sec) }) as unknown as ConceptItem;
  const moduleAt = (id: string, sec: number): ModuleSegment =>
    ({ ...moduleSeg(id), createdAt: at(sec) }) as unknown as ModuleSegment;
  const recording = (id: string, segmentIndex: number): RecordingSegment =>
    ({ id, sessionId: SID, segmentIndex, tStart: segmentIndex * 10 }) as unknown as RecordingSegment;

  test("raw segment (t_start, chunkIndex)", () => {
    let s = reducer(init(), rawSegmentsLoaded({ sessionId: SID, segments: [raw("a", 0), raw("b", 5), raw("c", 9)] }));
    s = reducer(s, rawSegmentRemoved({ sessionId: SID, segmentId: "b" }));
    s = reducer(s, liveRowUpdateAction(s, SID, { kind: "raw", item: raw("b", 5) }));
    expect(s.rawIdsBySession[SID]).toEqual(["a", "b", "c"]);
  });

  test("cleaned segment (t_start)", () => {
    let s = reducer(init(), cleanedSegmentsLoaded({ sessionId: SID, segments: [cleaned("c1", 0), cleaned("c2", 10), cleaned("c3", 20)] }));
    s = reducer(s, cleanedSegmentRemoved({ sessionId: SID, segmentId: "c2" }));
    s = reducer(s, liveRowUpdateAction(s, SID, { kind: "cleaned", item: cleaned("c2", 10) }));
    expect(s.cleanedIdsBySession[SID]).toEqual(["c1", "c2", "c3"]);
  });

  test("concept item (created_at)", () => {
    let s = reducer(init(), conceptsLoaded({ sessionId: SID, items: [conceptAt("k1", 1), conceptAt("k2", 2), conceptAt("k3", 3)] }));
    s = reducer(s, conceptItemRemoved({ sessionId: SID, itemId: "k2" }));
    s = reducer(s, liveRowUpdateAction(s, SID, { kind: "concept", item: conceptAt("k2", 2) }));
    expect(s.conceptIdsBySession[SID]).toEqual(["k1", "k2", "k3"]);
  });

  test("concept created_at compares at microsecond precision", () => {
    const early = { ...concept("e"), createdAt: "2026-09-28T01:00:01.000001+00:00" } as unknown as ConceptItem;
    const late = { ...concept("l"), createdAt: "2026-09-28T01:00:01.000002+00:00" } as unknown as ConceptItem;
    let s = reducer(init(), conceptsLoaded({ sessionId: SID, items: [early, late] }));
    s = reducer(s, conceptItemRemoved({ sessionId: SID, itemId: "e" }));
    s = reducer(s, liveRowUpdateAction(s, SID, { kind: "concept", item: early }));
    expect(s.conceptIdsBySession[SID]).toEqual(["e", "l"]);
  });

  test("module segment (created_at)", () => {
    let s = reducer(init(), moduleSegmentsLoaded({ sessionId: SID, segments: [moduleAt("m1", 1), moduleAt("m2", 2), moduleAt("m3", 3)] }));
    s = reducer(s, moduleSegmentRemoved({ sessionId: SID, segmentId: "m1" }));
    s = reducer(s, liveRowUpdateAction(s, SID, { kind: "module", item: moduleAt("m1", 1) }));
    expect(s.moduleSegmentIdsBySession[SID]).toEqual(["m1", "m2", "m3"]);
  });

  test("recording segment (segment_index)", () => {
    let s = reducer(init(), recordingSegmentsLoaded({ sessionId: SID, segments: [recording("r0", 0), recording("r1", 1), recording("r2", 2)] }));
    s = reducer(s, recordingSegmentRemoved({ sessionId: SID, segmentId: "r1" }));
    s = reducer(s, recordingSegmentUpserted({ sessionId: SID, segment: recording("r1", 1) }));
    expect(s.recordingSegmentIdsBySession[SID]).toEqual(["r0", "r1", "r2"]);
  });

  test("a freshly inserted concept still lands after the rows before it", () => {
    let s = reducer(init(), conceptsLoaded({ sessionId: SID, items: [conceptAt("k1", 1)] }));
    s = reducer(s, liveRowUpdateAction(s, SID, { kind: "concept", item: conceptAt("k9", 9) }));
    expect(s.conceptIdsBySession[SID]).toEqual(["k1", "k9"]);
  });
});
