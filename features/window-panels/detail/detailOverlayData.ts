// features/window-panels/detail/detailOverlayData.ts
//
// The overlay-slice shape of a Detail instance, and its parser. The openers
// write it flat (Redux data must be plain); the controller reads it back by
// name. ONE spelling, here. The URL spellings — the page query and the
// `?panels=` token — are the primitive's own (`encodeListQuery` /
// `detailListToUrlArgs` in `@ai-matrx/detail`), never a second copy here.

import type { DetailInstanceData, DetailListContext, DetailRef } from "@ai-matrx/detail";

export interface DetailOverlayData {
  type: string;
  id: string;
  seedName: string | null;
  seedAbout: string | null;
  listItems: DetailRef[] | null;
  listIndex: number | null;
  /**
   * 🚨 NEW-13 (VERIFY-U-P1-R3) — THE TRIM TRAVELS. The page presentation's list
   * is capped before it rides the URL and the detail SAYS so; this payload
   * carried `listItems` / `listIndex` only, so switching a trimmed page to a
   * window or a docked panel — or taking the Undo that reopens a replaced record
   * — presented 200 records as the whole list, silently. The length of the list
   * the window was cut from, or `null` when nothing was cut.
   */
  listTrimmedFrom: number | null;
}

function isDetailRef(value: unknown): value is DetailRef {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

/** Narrow the untyped overlay payload; `null` when it does not name a record. */
export function readDetailOverlayData(
  data: Record<string, unknown> | null | undefined,
): DetailOverlayData | null {
  if (!data || typeof data.type !== "string" || typeof data.id !== "string") return null;
  const listItems = Array.isArray(data.listItems) ? data.listItems.filter(isDetailRef) : null;
  return {
    type: data.type,
    id: data.id,
    seedName: typeof data.seedName === "string" ? data.seedName : null,
    seedAbout: typeof data.seedAbout === "string" ? data.seedAbout : null,
    listItems: listItems && listItems.length > 0 ? listItems : null,
    listIndex: typeof data.listIndex === "number" ? data.listIndex : null,
    listTrimmedFrom:
      typeof data.listTrimmedFrom === "number" && Number.isFinite(data.listTrimmedFrom)
        ? data.listTrimmedFrom
        : null,
  };
}

export function toDetailInstanceData(data: DetailOverlayData): DetailInstanceData {
  const list: DetailListContext | null =
    data.listItems && data.listIndex !== null
      ? {
          items: data.listItems,
          index: data.listIndex,
          // A trim smaller than the list it claims to have cut is not a trim.
          ...(data.listTrimmedFrom && data.listTrimmedFrom > data.listItems.length
            ? { trimmedFrom: data.listTrimmedFrom }
            : {}),
        }
      : null;
  const seed =
    data.seedName || data.seedAbout ? { name: data.seedName, about: data.seedAbout } : null;
  return { type: data.type, id: data.id, seed, list };
}
