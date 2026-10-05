// features/block-state/redux/blockStateThunks.ts
//
// Hydration (one batched read per unit, deduped) and the realtime hookup.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { listConversationBlockStates, listEntityBlockStates } from "../blockStateService";
import { subscribeBlockStateFeed } from "../blockStateRealtime";
import { setBlockStateHydration, upsertBlockStateRows } from "./blockStatesSlice";

interface UnitRef {
  /** Hydration key (`conversation:<id>` | `<token>:<id>`). */
  unit: string;
  scope: string;
  entityType: string;
  entityId: string;
}

export function unitRefOf(entityType: string, entityId: string | null, conversationId: string | null): UnitRef | null {
  if (entityType === "message") {
    return conversationId
      ? { unit: `conversation:${conversationId}`, scope: "conversation", entityType, entityId: conversationId }
      : null;
  }
  if (!entityId) return null;
  return { unit: `${entityType}:${entityId}`, scope: entityType, entityType, entityId };
}

async function readUnit(dispatch: AppDispatch, ref: UnitRef): Promise<void> {
  const rows =
    ref.scope === "conversation"
      ? await listConversationBlockStates(ref.entityId)
      : await listEntityBlockStates(ref.entityType, [ref.entityId]);
  dispatch(upsertBlockStateRows(rows));
}

/** Load a unit once (deduped by the hydration map). */
export function ensureBlockStatesLoaded(ref: UnitRef) {
  return async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const held = getState().blockStates.hydration[ref.unit];
    if (held === "loading" || held === "loaded") return;
    dispatch(setBlockStateHydration({ unit: ref.unit, status: "loading" }));
    try {
      await readUnit(dispatch, ref);
      dispatch(setBlockStateHydration({ unit: ref.unit, status: "loaded" }));
    } catch (error) {
      console.error("[block-state] hydrate failed:", error);
      dispatch(setBlockStateHydration({ unit: ref.unit, status: "error" }));
    }
  };
}

/** Keep a unit live: rows land through the slice; a missed gap re-reads the unit. Returns the release. */
export function watchBlockStates(ref: UnitRef) {
  return (dispatch: AppDispatch, getState: () => RootState): (() => void) => {
    const userId = selectUserId(getState());
    if (!userId) return () => {};
    return subscribeBlockStateFeed({ scope: ref.scope, entityId: ref.entityId }, userId, (signal) => {
      if ("rows" in signal) dispatch(upsertBlockStateRows(signal.rows));
      else void readUnit(dispatch, ref).catch((e) => console.error("[block-state] resync failed:", e));
    });
  };
}
