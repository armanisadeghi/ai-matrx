// features/window-panels/detail/openDetailSingleton.ts
//
// 🚨 D8 — THE ONE PLACE THE DETAIL SINGLETON IS REPLACED.
//
// The Detail window and the docked panel are singletons on purpose (the Notion
// peek), so opening a second record retargets the one panel. Whoever performs
// that replacement owes the person the sentence saying which record was closed
// — and round 1 put that sentence in the two opener HOOKS, which is the mistake
// this module exists to make impossible: `?panels=detail:file.B,detail:file.C`
// never goes near those hooks (`UrlPanelManager` calls the registered hydrator
// once per token, and the hydrator dispatched `openOverlay` itself), so the
// second record still replaced the first in silence (VERIFY-U-P1-R2, D8).
//
// So there is now exactly ONE way a detail singleton is opened: this thunk.
// It reads the overlay about to be replaced, announces the replacement, and
// dispatches the open. The announcement cannot be forgotten by a new opener,
// a hydrator, an extension bridge or a test seat, because none of them can
// reach `openOverlay` for these two overlays without coming through here.
//
// Why a thunk and not the reducer: the reducer is pure — a toast with an Undo
// action cannot live there — and it is also the wrong altitude, since "this is
// a REPLACEMENT" is a question about the state before the action, which is
// exactly what a thunk sees and a reducer's caller does not.

import type { Dispatch, UnknownAction } from "@reduxjs/toolkit";

import {
  openOverlay,
  selectOverlay,
  type StateWithOverlays,
} from "@/lib/redux/slices/overlaySlice";
import type { DetailInstanceData, DetailPresentation } from "@/lib/detail/types";
import { announceSingletonReplacement } from "./singletonReplacement";

export type InPlaceDetailPresentation = Exclude<DetailPresentation, "page">;

const OVERLAY_ID: Record<InPlaceDetailPresentation, "detailWindow" | "detailDocked"> = {
  window: "detailWindow",
  docked: "detailDocked",
};

/** The surface in the person's own words, for the sentence that names it. */
const SURFACE: Record<InPlaceDetailPresentation, string> = {
  window: "window",
  docked: "docked panel",
};

/**
 * The overlay-slice payload for a detail instance. Flat: Redux data is plain.
 *
 * 🚨 NEW-13 — EVERY FIELD THE INSTANCE CARRIES IS HERE, `trimmedFrom` INCLUDED.
 * A field dropped in this function is a field the window and the docked panel
 * silently do not have: the honest "you are stepping through 200 of 500" line
 * died exactly here, because nothing downstream can rebuild what the payload
 * never carried. Exported so the round trip (payload → `readDetailOverlayData` →
 * `toDetailInstanceData`) is provable without a store.
 */
export function overlayPayloadForDetail(data: DetailInstanceData) {
  return {
    type: data.type,
    id: data.id,
    seedName: data.seed?.name ?? null,
    seedAbout: data.seed?.about ?? null,
    listItems: data.list?.items ?? null,
    listIndex: data.list?.index ?? null,
    listTrimmedFrom: data.list?.trimmedFrom ?? null,
  };
}

export interface OpenDetailSingletonArgs {
  presentation: InPlaceDetailPresentation;
  data: DetailInstanceData;
  /**
   * `false` only for the Undo re-open, which the toast it came from already
   * explained. Everything else announces — including a hydrator.
   */
  announce?: boolean;
}

/**
 * Open a record in the window or the docked panel, announcing the record this
 * replaces. Returns whether a record was actually replaced (tests read that;
 * the person reads the toast).
 */
export function openDetailSingleton({
  presentation,
  data,
  announce = true,
}: OpenDetailSingletonArgs) {
  return (dispatch: Dispatch<UnknownAction>, getState: () => StateWithOverlays): boolean => {
    const overlayId = OVERLAY_ID[presentation];
    let replaced = false;
    if (announce) {
      const before = selectOverlay(getState(), overlayId);
      replaced = announceSingletonReplacement({
        previousData: before.data as Record<string, unknown> | null | undefined,
        previousWasOpen: before.isOpen,
        next: data,
        surface: SURFACE[presentation],
        reopen: (previous) => {
          // The same open, with no second announcement: the toast this Undo came
          // from already said what is happening.
          dispatch(openOverlay({ overlayId, data: overlayPayloadForDetail(previous) }));
        },
      });
    }
    dispatch(openOverlay({ overlayId, data: overlayPayloadForDetail(data) }));
    return replaced;
  };
}
