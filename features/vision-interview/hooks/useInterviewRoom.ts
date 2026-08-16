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

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
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

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;
const BACKOFF_RESET_AFTER_MS = 30_000;

export function useInterviewRoom(sessionId: string) {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectRoomSession);
  const hydrated = useAppSelector(selectRoomHydrated);

  const attemptRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    const timers = timersRef.current;

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
          source: "vision-interview-hydrate",
          message: `[vision-interview] room hydration failed for ${sessionId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          raw: { sessionId, err },
        });
      }
    };

    const subscribe = () => {
      if (disposed) return;
      unsubscribe?.();
      const healthyTimer = setTimeout(() => {
        // Channel stayed up — only now does the backoff counter reset.
        attemptRef.current = 0;
      }, BACKOFF_RESET_AFTER_MS);
      timers.push(healthyTimer);

      unsubscribe = subscribeToRoom(sessionId, {
        onTurn: (row) => dispatch(turnMerged(row)),
        onQuestion: (row) => dispatch(questionMerged(row)),
        onHole: (row) => dispatch(holeMerged(row)),
        onSession: (row) => dispatch(sessionMerged(row)),
        onChannelDown: () => {
          clearTimeout(healthyTimer);
          if (disposed) return;
          attemptRef.current += 1;
          const delay = Math.min(
            BACKOFF_BASE_MS * 2 ** (attemptRef.current - 1),
            BACKOFF_CAP_MS,
          );
          const retryTimer = setTimeout(() => {
            if (disposed) return;
            subscribe();
            // Catch-up fetch: events during the gap are lost forever.
            void hydrate();
          }, delay);
          timers.push(retryTimer);
        },
      });
    };

    void hydrate();
    subscribe();

    return () => {
      disposed = true;
      unsubscribe?.();
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
    };
  }, [dispatch, sessionId]);

  return { session, hydrated };
}
