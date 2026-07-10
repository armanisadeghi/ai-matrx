// hooks/useAutosave.ts
//
// A small, generic autosave primitive: debounce a payload, persist it through a
// caller-supplied async save, and expose a status a UI can show ("Saving…" /
// "Saved" / "Unsaved changes" / error). Entity-agnostic — the caller owns WHAT
// to save (the save fn) and WHAT the payload is; this owns the debounce, the
// in-flight coalescing, the status, and the flush-on-unmount so no keystroke is
// ever lost. (Notes have their own coupled version; this is the reusable one.)
//
// Never throws: the save fn returns `{ error }` (supabase-service style) and a
// non-null error flips status to "error" and re-queues, so a blocked write is
// loud, not silent.
//
// React Compiler is on: no manual useMemo / useCallback — plain closures.

"use client";

import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

export interface UseAutosaveResult<T> {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  /** Queue a payload and (re)start the debounce. */
  schedule: (value: T) => void;
  /** Cancel the debounce and save the pending payload immediately. */
  flush: () => void;
}

export function useAutosave<T>(opts: {
  save: (value: T) => Promise<{ error: string | null }>;
  debounceMs?: number;
}): UseAutosaveResult<T> {
  const { save, debounceMs = 900 } = opts;
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const pendingRef = useRef<{ value: T } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  // Keep the latest save fn without threading it through closures (updated in an
  // effect, never during render).
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  async function saveNow(): Promise<void> {
    if (savingRef.current) return; // a later debounce flush picks up new edits
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    savingRef.current = true;
    setStatus("saving");
    try {
      const res = await saveRef.current(pending.value);
      if (res.error) {
        // Re-queue so the next schedule/flush retries; surface loudly.
        pendingRef.current = pendingRef.current ?? pending;
        setStatus("error");
      } else {
        setLastSavedAt(new Date());
        setStatus(pendingRef.current ? "unsaved" : "saved");
      }
    } catch {
      pendingRef.current = pendingRef.current ?? pending;
      setStatus("error");
    } finally {
      savingRef.current = false;
      // If edits arrived mid-save, drain them promptly.
      if (pendingRef.current) void saveNow();
    }
  }

  function schedule(value: T): void {
    pendingRef.current = { value };
    setStatus("unsaved");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void saveNow(), debounceMs);
  }

  function flush(): void {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void saveNow();
  }

  // Flush any pending payload on unmount so an in-progress edit is never lost.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const pending = pendingRef.current;
      if (pending && !savingRef.current) {
        pendingRef.current = null;
        void saveRef.current(pending.value);
      }
    };
  }, []);

  return { status, lastSavedAt, schedule, flush };
}
