// features/flashcards/fast-fire/redux/fastFireSession.ts
//
// FastFire follows the one study-session contract (useLazyStudySession): the
// `study_session` is written on the FIRST ANSWER, never when Start is pressed.
// Starting a drill and leaving writes nothing.
//
// The drill's identity is a CLIENT run id (`state.fastFire.runId`, minted at
// Start) — it guards stale grade dispatches from an earlier run. The session id
// is separate and stays null until the first answer opens it.
//
// The launcher ARMS the opener for its run (`armFastFireSession`); the drill
// kicks `ensureFastFireSession(runId)` the moment a card is answered, and the
// grade thunk calls it again (sharing the one in-flight open). Finalize and
// abort read `awaitFastFireSession(runId)`, which waits for an open already in
// flight but never starts one. Offline, nothing opens: attempts queue
// session-less, exactly like every other mode.

import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { StudyResult, StudySessionRow } from "@/features/education/study/types";
import { sessionOpened } from "./fastFireSlice";

type Opener = () => Promise<StudyResult<StudySessionRow>>;

/** One drill runs at a time, so one armed slot (no unbounded map). */
let armed: {
  runId: string;
  open: Opener;
  pending: Promise<string | null> | null;
} | null = null;

/** A new client run id for a drill. */
export function newFastFireRunId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ff-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Arm (never write) the session for this run. */
export function armFastFireSession(runId: string, open: Opener): void {
  armed = { runId, open, pending: null };
}

/** Open this run's session once (first answer); later calls share it. */
export function ensureFastFireSession(runId: string | null) {
  return (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    if (!runId) return Promise.resolve(null);
    const ff = getState().fastFire;
    if (ff?.runId === runId && ff.sessionId) return Promise.resolve(ff.sessionId);
    if (!armed || armed.runId !== runId) return Promise.resolve(null);
    if (armed.pending) return armed.pending;
    // Offline: the insert would only burn retries against a dead connection.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return Promise.resolve(null);
    }
    const slot = armed;
    slot.pending = slot.open().then(
      (res) => {
        if (res.error || !res.data) {
          // Loud; not retried per card (a refusal would slow every grade).
          console.error("[fastfire] opening the study session failed:", res.error);
          return null;
        }
        dispatch(sessionOpened({ runId, sessionId: res.data.id }));
        return res.data.id;
      },
      (err: unknown) => {
        console.error("[fastfire] opening the study session threw:", err);
        return null;
      },
    );
    return slot.pending;
  };
}

/**
 * The run's session id for finalize/abort: waits for an open already in
 * flight, never starts one (no answer = no session to close).
 */
export function awaitFastFireSession(runId: string | null) {
  return (
    _dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<string | null> => {
    if (!runId) return Promise.resolve(null);
    const ff = getState().fastFire;
    if (ff?.runId === runId && ff.sessionId) return Promise.resolve(ff.sessionId);
    if (armed && armed.runId === runId && armed.pending) return armed.pending;
    return Promise.resolve(null);
  };
}
