"use client";

// features/war-room/hooks/useThreadReorder.ts
//
// Feature e007e2fc — reorder threads by drag, in the Stage rail, Stage view, and
// Grid view. ONE writer the three surfaces share, so the persist logic lives
// once (no forked drag handling).
//
// The order is the tiles' `position` field (the same one
// `selectOrderedGalleryTileIds` sorts by, pinned-first). A drag produces a new
// id order; we re-stamp `position` from each id's NEW index and:
//   • optimistically apply it to the slice (`setTilePosition`) so the move is
//     instant and the gallery/rail re-sorts immediately, then
//   • persist the batch (`persistTilePositions`) — loud toast on failure.
//
// Pinned-vs-unpinned: the gallery sorts pinned ahead of unpinned regardless of
// position, so dragging across that boundary would otherwise "snap back". We
// re-stamp positions across the WHOLE ordered list (the order the user sees),
// which keeps a within-group reorder stable and a cross-boundary drop coherent
// (the dropped tile takes its neighbor's position; the pinned/unpinned grouping
// still wins in the selector, so the visible result matches the drop intent
// within each group). Positions are assigned by stride so they stay distinct.

import { useCallback } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { setTilePosition } from "@/features/war-room/redux/slice";
import { persistTilePositions } from "@/features/war-room/redux/thunks";
import { selectOrderedGalleryTileIds } from "@/features/war-room/redux/selectors";

/** Position stride between adjacent threads (leaves room to insert without a full re-stamp). */
const POSITION_STRIDE = 10;

export interface ThreadReorder {
  /**
   * Commit a new visible-thread order (the full ordered id list AFTER the move).
   * Re-stamps `position` from each id's index, applies optimistically, persists.
   * A no-op when the order is unchanged.
   */
  commitOrder: (orderedIds: string[]) => void;
}

export function useThreadReorder(sessionId: string): ThreadReorder {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const commitOrder = useCallback(
    (orderedIds: string[]) => {
      // Read the live current order to detect a true change + skip no-op writes.
      const current = selectOrderedGalleryTileIds(sessionId)(store.getState());
      if (
        orderedIds.length === current.length &&
        orderedIds.every((id, i) => id === current[i])
      ) {
        return; // unchanged
      }

      const updates = orderedIds.map((id, i) => ({
        id,
        position: i * POSITION_STRIDE,
      }));

      // Optimistic: re-sort the slice immediately (one small update per tile).
      for (const u of updates) {
        dispatch(setTilePosition(u));
      }
      // Durable: persist the batch (loud toast on failure inside the thunk).
      void dispatch(persistTilePositions(updates));
    },
    [dispatch, store, sessionId],
  );

  return { commitOrder };
}
