"use client";

/**
 * Opener for the `reviewWalkWindow` overlay (multi-instance).
 *
 * - `useOpenReviewWalkWindow()` — imperative hook. Each walked unit
 *   (unit_kind, unit_id) gets its own deterministic instanceId
 *   (`features/review-walk/address.ts`), so walks on different messages float
 *   side by side while re-opening the SAME unit focuses the existing window
 *   instead of stacking a duplicate. The open itself is the shared
 *   `openReviewWalk` thunk — the `?panels=review_walk:` hydrator uses it too.
 * - `<ReviewWalkWindowController />` — declarative wrapper.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import type { WalkUnitKind } from "@/features/review-walk/types";
import {
  REVIEW_WALK_OVERLAY_ID,
  openReviewWalk,
} from "@/features/review-walk/openReviewWalk";

export interface OpenReviewWalkWindowOptions {
  unitKind: WalkUnitKind;
  unitId: string;
  /** The agent behind the walked conversation, when known — powers the
   * receipt's door to `/agents/{id}/hindsight`. */
  agentId?: string | null;
  agentName?: string | null;
  /** Short role label for the window title ("Live" / "Candidate"). */
  roleLabel?: string | null;
  /** What tells this walk from a sibling with the same role ("Pair 3"). */
  detailLabel?: string | null;
}

export interface ReviewWalkWindowHandle {
  close: () => void;
}

export function useOpenReviewWalkWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenReviewWalkWindowOptions): ReviewWalkWindowHandle => {
      const instanceId = dispatch(openReviewWalk(opts));
      return {
        close: () =>
          dispatch(
            closeOverlay({ overlayId: REVIEW_WALK_OVERLAY_ID, instanceId }),
          ),
      };
    },
    [dispatch],
  );
}

export function ReviewWalkWindowController(
  props: OpenReviewWalkWindowOptions,
): null {
  const open = useOpenReviewWalkWindow();
  useEffect(() => {
    const handle = open(props);
    return () => handle.close();
  }, [open, props.unitKind, props.unitId, props.agentId, props.agentName]);
  return null;
}
