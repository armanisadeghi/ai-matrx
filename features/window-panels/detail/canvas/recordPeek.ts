// features/window-panels/detail/canvas/recordPeek.ts
//
// The Detail primitive's DOCKED presentation is a canvas tab: the `record-peek`
// kind, keyed by the record (`type.id`, the same spelling as the `?panels=`
// token). Opening the same record again focuses its tab; another record gets
// its own tab beside it — the canvas's tabs replace the old one-panel
// singleton, so nothing is closed behind the person's back.
//
// The item data is the flat overlay payload (plain JSON), read back through the
// ONE parser (`readDetailOverlayData`), so the list context and its trim travel
// exactly as they do for the window.

import type { CanvasJson, CanvasOpenInput } from "@ai-matrx/canvas";
import { detailInstanceKey, type DetailInstanceData } from "@ai-matrx/detail";
import { readDetailOverlayData, toDetailInstanceData } from "../detailOverlayData";

export const RECORD_PEEK_KIND = "record-peek";

type RecordPeekData = {
  type: string;
  id: string;
  seedName: string | null;
  seedAbout: string | null;
  listItems: { type: string; id: string }[] | null;
  listIndex: number | null;
  listTrimmedFrom: number | null;
};

/** The canvas open request for one record. */
export function recordPeekOpenInput(data: DetailInstanceData): CanvasOpenInput {
  const payload: RecordPeekData = {
    type: data.type,
    id: data.id,
    seedName: data.seed?.name ?? null,
    seedAbout: data.seed?.about ?? null,
    listItems: data.list?.items.map((ref) => ({ type: ref.type, id: ref.id })) ?? null,
    listIndex: data.list?.index ?? null,
    listTrimmedFrom: data.list?.trimmedFrom ?? null,
  };
  return {
    kind: RECORD_PEEK_KIND,
    key: detailInstanceKey(data),
    // Absent, not null: re-opening a tab whose title the record already
    // resolved must not wipe it back to the kind's label.
    ...(data.seed?.name ? { title: data.seed.name } : {}),
    data: payload,
  };
}

/** The record a `record-peek` tab shows; `null` when its data names none. */
export function readRecordPeekData(data: CanvasJson): DetailInstanceData | null {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const parsed = readDetailOverlayData(data as Record<string, unknown>);
  return parsed ? toDetailInstanceData(parsed) : null;
}
