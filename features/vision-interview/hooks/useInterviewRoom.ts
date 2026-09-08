// features/vision-interview/hooks/useInterviewRoom.ts
//
// Owns the room's DATA lifecycle for one open session:
//   1. Hydrate everything (session / turns / questions / holes / revisions)
//      in ONE batched dispatch (supabase-realtime skill rule 2).
//   2. Subscribe ONE realtime channel for the room; every payload flows
//      through the slice's timestamp-monotonic merge (rule 1 lives in the
//      reducers, so refetch races cannot bypass it).
//   3. On channel drop: exponential backoff (1s → 30s), resubscribe, then a
//      catch-up hydration — realtime has no replay (rule 3). The attempt
//      counter only resets after the channel stays healthy for 30s.
//   4. Ask the SERVER for this session's role bindings (`useRoleBindings`),
//      unconditionally, before the person can talk — that is the ONE thing
//      the browser cannot produce for itself and the difference between a
//      talkable room and six dead tabs.

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { useRoleBindings } from "./useRoleBindings";
import {
  getSession,
  listHoles,
  listQuestions,
  listRevisions,
  listTurns,
  subscribeToRoom,
} from "../service";
import {
  holeMerged,
  questionMerged,
  roomHydrated,
  roomOpened,
  selectRoomHydrated,
  selectRoomSession,
  sessionMerged,
  turnMerged,
} from "../redux/vision-interview.slice";


export function useInterviewRoom(sessionId: string) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectRoomSession);
  const hydrated = useAppSelector(selectRoomHydrated);

  // Every stage tab is a real conversation only once the server has resolved
  // its mandate — so this runs for EVERY session, run or no run.
  const { retryRoles } = useRoleBindings(sessionId);


  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    dispatch(roomOpened({ sessionId }));

    const hydrate = async () => {
      try {
        const [sessionRow, turns, questions, holes, revisions] =
          await Promise.all([
            getSession(sessionId),
            listTurns(sessionId),
            listQuestions(sessionId),
            listHoles(sessionId),
            listRevisions(sessionId),
          ]);
        if (disposed) return;
        // ONE batched dispatch for the whole room — never per-row.
        dispatch(
          roomHydrated({
            sessionId,
            session: sessionRow,
            turns,
            questions,
            holes,
            revisions,
          }),
        );
      } catch (err) {
        if (disposed) return;
        captureError({
          source: "supabase-exception",
          message: `[vision-interview] room hydration failed for ${sessionId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          raw: { sessionId, err },
        });
      }
    };

    // Backoff, the attempt counter, the healthy-timer reset and the catch-up
    // refetch all used to live here; `@ai-matrx/realtime` owns every one of
    // them now, and its backfill door fires on tab wake and network restore
    // too — not only on a channel error, which is what this hook could see.
    void hydrate();
    unsubscribe = subscribeToRoom(sessionId, {
      onTurn: (row) => dispatch(turnMerged(row)),
      onQuestion: (row) => dispatch(questionMerged(row)),
      onHole: (row) => dispatch(holeMerged(row)),
      onSession: (row) => dispatch(sessionMerged(row)),
      // Realtime has no replay — re-read the whole room on every recovery path.
      onBackfill: hydrate,
    });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [dispatch, sessionId]);

  return { session, hydrated, retryRoles };
}
