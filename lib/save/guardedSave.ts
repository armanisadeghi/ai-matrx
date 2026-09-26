// lib/save/guardedSave.ts
//
// NOTHING FAILS SILENTLY — THE SAVE THAT STALLS (RC-B6 round 2). A save that
// hangs (a stalled server action, a pool storm) used to spin forever with no
// word: the person could not tell "saving" from "stuck", and nothing offered
// a way out. Every save goes through this ONE step:
//
//   * after `stallMs` (default 10 s) with no answer, a persistent notice says
//     so in plain words — the change is still on screen, it may still land —
//     and offers Retry;
//   * when the save settles, the notice is withdrawn (success or failure is
//     the caller's own sentence, as before);
//   * the draft is never touched here: the form keeps what the person typed.
//
// It does not abort the request (a server action cannot be recalled), so it
// never claims the save failed — only that it has not answered yet.

import { toast } from "@/lib/toast";

export const SAVE_STALL_MS = 10_000;

export interface GuardedSaveOptions {
  /** What is being saved, in the person's words: "the list", "your note". */
  what: string;
  /**
   * Sends the same save again (the Retry button). Omit for a save that is NOT
   * safe to repeat (a create): the notice then says to wait instead.
   */
  onRetry?: () => void;
  /** Milliseconds before the stall notice. Default 10 s. */
  stallMs?: number;
}

let nextId = 0;

export async function guardedSave<T>(
  run: () => Promise<T>,
  { what, onRetry, stallMs = SAVE_STALL_MS }: GuardedSaveOptions,
): Promise<T> {
  const id = `save-stall-${++nextId}`;
  let stalled = false;
  const timer = setTimeout(() => {
    stalled = true;
    const seconds = Math.round(stallMs / 1000);
    const description = onRetry
      ? "Saving " +
        what +
        " hasn't finished after " +
        seconds +
        " seconds. Your changes are still here and may still save — Retry sends them again."
      : "Saving " +
        what +
        " hasn't finished after " +
        seconds +
        " seconds. Your changes are still here; it may still save — give it a moment before trying again.";
    toast.info("Still saving…", {
      id,
      description,
      duration: Number.POSITIVE_INFINITY,
      ...(onRetry
        ? { action: { label: "Retry", onClick: () => onRetry() } }
        : {}),
    });
  }, stallMs);
  try {
    return await run();
  } finally {
    clearTimeout(timer);
    if (stalled) toast.dismiss(id);
  }
}
