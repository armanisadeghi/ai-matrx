/**
 * features/review-walk/openReviewWalk.ts — the ONE way a review walk opens.
 *
 * Used by the `useOpenReviewWalkWindow` opener (a click) and by the
 * `?panels=review_walk:` hydrator (a link / reload), so both paths share the
 * focus-don't-duplicate rule: the same walked unit already floating is
 * surfaced (un-minimised + raised), never re-dispatched over — which would
 * also wipe the agent fields a click supplied with the link's nulls.
 */
import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { openOverlay, selectOpenInstances } from "@/lib/redux/slices/overlaySlice";
import { focusWindow, restoreWindow } from "@/lib/redux/slices/windowManagerSlice";
import { reviewWalkInstanceId, type WalkUnitRef } from "./address";
import { nextStackIndex } from "./walkTitle";

export const REVIEW_WALK_OVERLAY_ID = "reviewWalkWindow" as const;

export interface OpenReviewWalkArgs extends WalkUnitRef {
  agentId?: string | null;
  agentName?: string | null;
  /** Short role label for the window title ("Live" / "Candidate"). */
  roleLabel?: string | null;
  /** What tells this walk from a sibling with the same role ("Pair 3"). */
  detailLabel?: string | null;
}

/** Returns the instance id that is now open (new or focused). */
export function openReviewWalk(
  args: OpenReviewWalkArgs,
): ThunkAction<string, RootState, unknown, UnknownAction> {
  return (dispatch, getState) => {
    const instanceId = reviewWalkInstanceId(args);
    const open = selectOpenInstances(getState(), REVIEW_WALK_OVERLAY_ID);
    if (open.some((inst) => inst.instanceId === instanceId)) {
      dispatch(restoreWindow(instanceId));
      dispatch(focusWindow(instanceId));
      return instanceId;
    }
    dispatch(
      openOverlay({
        overlayId: REVIEW_WALK_OVERLAY_ID,
        instanceId,
        data: {
          stackIndex: nextStackIndex(
            open.map((inst) => (inst.data as { stackIndex?: unknown } | null)?.stackIndex),
          ),
          unitKind: args.unitKind,
          unitId: args.unitId,
          agentId: args.agentId ?? null,
          agentName: args.agentName ?? null,
          roleLabel: args.roleLabel ?? null,
          detailLabel: args.detailLabel ?? null,
        },
      }),
    );
    return instanceId;
  };
}
