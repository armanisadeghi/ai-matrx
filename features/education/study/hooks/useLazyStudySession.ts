"use client";

// features/education/study/hooks/useLazyStudySession.ts
//
// A study session is written on the FIRST RECORDED ANSWER, never on arrival.
//
// Every study mode used to open its `study_session` the moment the page (or
// the Start button) loaded. Opening a review and leaving therefore wrote an
// empty session — "Unknown set · Adaptive" in history — and the progress
// narrator (a paid AI run) read those empties as real sittings.
//
// A mode ARMS the session when its deck is ready (`arm(opener)` — nothing is
// written) and calls `ensure()` just before it records an answer. The first
// `ensure()` runs the opener (the same `studyService.createSession` /
// `gameService.startGameSession` call the mode always used, so the
// organization hold is unchanged); every later or concurrent call shares that
// one result. Re-arming (a new set, a new round) forgets the old session
// without writing anything. With the device offline `ensure()` writes nothing
// and returns null: attempts are valid session-less and queue in the outbox.

import { useRef, useState } from "react";
import type { StudyResult, StudySessionRow } from "../types";

export type StudySessionOpener = () => Promise<
  | StudyResult<StudySessionRow>
  | { data: StudySessionRow | null; error: unknown }
>;

export interface LazyStudySession {
  /** The session, once the first answer opened it. Null before that. */
  session: StudySessionRow | null;
  /**
   * Arm a new sitting — writes nothing. `opener` runs on the first answer;
   * null means this sitting records no session (e.g. `withSession: false`).
   */
  arm: (opener: StudySessionOpener | null) => void;
  /** Open the session on the first answer (once); later calls share it. */
  ensure: () => Promise<StudySessionRow | null>;
}

export function useLazyStudySession(label: string): LazyStudySession {
  const [session, setSession] = useState<StudySessionRow | null>(null);
  const openerRef = useRef<StudySessionOpener | null>(null);
  const pendingRef = useRef<Promise<StudySessionRow | null> | null>(null);
  const generationRef = useRef(0);

  // `arm` / `ensure` are created ONCE (they touch only refs and the state
  // setter) so callers may list them as effect/callback dependencies.
  const [api] = useState(() => {
    const arm = (opener: StudySessionOpener | null): void => {
      generationRef.current += 1;
      openerRef.current = opener;
      pendingRef.current = null;
      setSession(null);
    };

    const ensure = (): Promise<StudySessionRow | null> => {
      if (pendingRef.current) return pendingRef.current;
      const opener = openerRef.current;
      if (!opener) return Promise.resolve(null);
      // Offline: `createSession` is a network insert whose transient retry would
      // burn round trips against a dead connection. Write nothing; the attempt
      // still queues session-less. The next online answer opens it.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return Promise.resolve(null);
      }
      const generation = generationRef.current;
      const pending = opener().then(
        (res) => {
          if (generation !== generationRef.current) return null;
          if (res.error || !res.data) {
            // Loud, and not retried on every answer (a deterministic refusal
            // would otherwise slow each grade); attempts stay session-less.
            console.error(
              `[${label}] opening the study session failed:`,
              res.error,
            );
            return null;
          }
          setSession(res.data);
          return res.data;
        },
        (err: unknown) => {
          console.error(`[${label}] opening the study session threw:`, err);
          return null;
        },
      );
      pendingRef.current = pending;
      return pending;
    };
    return { arm, ensure };
  });

  return { session, arm: api.arm, ensure: api.ensure };
}
