// lib/errors/usePendingWrites.ts — PENDING, NEVER OPTIMISTIC (GATES-TAIL-2).
//
// A toggle over a write does not change until the write answers. While it is in flight the
// control shows busy (disabled + aria-busy + a "Saving…"/"Pausing…" label); when the server
// agrees the caller sets the new value; when it refuses the control never moved, and the
// person reads what did not happen, why, and what to do (`toastWriteFailure`) — never a
// method, a path, a status line or the database's own error text.
//
// VERIFIER-21 #1n found the schedule switch reading "paused" while the PATCH was still held, then
// snapping back with a raw developer line. The schedule toggle is the worked example
// (features/scheduling/redux/tasks/thunks.ts `toggleTaskEnabled`); this hook is the same rule
// for every component-state toggle, keyed so a list of rows can each be pending on its own.
"use client";

import { useCallback, useRef, useState } from "react";
import { toastWriteFailure } from "./toastWriteFailure";

export type PendingWriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown; skipped?: false }
  | { ok: false; skipped: true };

export interface PendingWrites {
  /** True while the write for `key` is in flight. */
  isPending: (key: string) => boolean;
  /** True while any write is in flight. */
  anyPending: boolean;
  /**
   * Run `write` for `key`. Resolves `{ ok: true, value }` once the server agreed — THEN set the
   * new value — or `{ ok: false, error }` after the failure was toasted in words. A second call
   * for a key already in flight is skipped (the control is busy; a double click is not a write).
   */
  run: <T>(
    key: string,
    write: () => Promise<T>,
    words: { action: string; remedy?: string },
  ) => Promise<PendingWriteResult<T>>;
}

export function usePendingWrites(): PendingWrites {
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const inFlight = useRef(new Set<string>());

  const run = useCallback(
    async <T,>(
      key: string,
      write: () => Promise<T>,
      words: { action: string; remedy?: string },
    ): Promise<PendingWriteResult<T>> => {
      if (inFlight.current.has(key)) return { ok: false, skipped: true };
      inFlight.current.add(key);
      setPending(new Set(inFlight.current));
      try {
        const value = await write();
        return { ok: true, value };
      } catch (error) {
        toastWriteFailure(error, words);
        return { ok: false, error };
      } finally {
        inFlight.current.delete(key);
        setPending(new Set(inFlight.current));
      }
    },
    [],
  );

  const isPending = useCallback((key: string) => pending.has(key), [pending]);
  return { isPending, anyPending: pending.size > 0, run };
}
