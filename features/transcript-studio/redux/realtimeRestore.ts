// Delete means archive — the RESTORE half of the studio realtime handlers.
//
// A studio row moved to Trash arrives as an UPDATE stamping `deleted_at`, and
// the middleware drops it from the live registry. Restoring it from Trash
// arrives as another UPDATE clearing `deleted_at` — but the in-place `*Updated`
// reducers only patch rows the store still holds, so a restored row stayed
// invisible until a reload. This decides, for a LIVE row (deleted_at null,
// not superseded), whether the UPDATE patches a row the store holds or brings
// back one it does not (restored from Trash, or an INSERT this tab missed).
// A trashed row is never routed here — the middleware removes it first.

import type { UnknownAction } from "@reduxjs/toolkit";
import type {
  CleanedSegment,
  ConceptItem,
  ModuleSegment,
  RawSegment,
} from "../types";
import {
  cleanedSegmentRestored,
  cleanedSegmentUpdated,
  conceptItemUpdated,
  conceptsAppended,
  moduleSegmentUpdated,
  moduleSegmentsAppended,
  rawSegmentUpdated,
  rawSegmentsAppended,
  type TranscriptStudioState,
} from "./slice";

export type StudioLiveRow =
  | { kind: "raw"; item: RawSegment }
  | { kind: "cleaned"; item: CleanedSegment }
  | { kind: "concept"; item: ConceptItem }
  | { kind: "module"; item: ModuleSegment };

export function liveRowUpdateAction(
  studio: TranscriptStudioState | undefined,
  sessionId: string,
  row: StudioLiveRow,
): UnknownAction {
  switch (row.kind) {
    case "raw": {
      const held = Boolean(studio?.rawById[sessionId]?.[row.item.id]);
      return held
        ? rawSegmentUpdated({ sessionId, segment: row.item })
        : rawSegmentsAppended({ sessionId, segments: [row.item] });
    }
    case "cleaned": {
      const held = Boolean(studio?.cleanedById[sessionId]?.[row.item.id]);
      return held
        ? cleanedSegmentUpdated({ sessionId, segment: row.item })
        : cleanedSegmentRestored({ sessionId, segment: row.item });
    }
    case "concept": {
      const held = Boolean(studio?.conceptsById[sessionId]?.[row.item.id]);
      return held
        ? conceptItemUpdated({ sessionId, item: row.item })
        : conceptsAppended({ sessionId, items: [row.item] });
    }
    case "module": {
      const held = Boolean(studio?.moduleSegmentsById[sessionId]?.[row.item.id]);
      return held
        ? moduleSegmentUpdated({ sessionId, segment: row.item })
        : moduleSegmentsAppended({ sessionId, segments: [row.item] });
    }
  }
}
