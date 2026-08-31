/**
 * components/dialogs/confirm/deferred-intent.ts
 *
 * NEVER OPEN A LAYER FROM INSIDE ANOTHER LAYER'S CLOSE.
 *
 * 🚨 THE DEFECT THIS ENDS (V1 round 3, blocker R3-1, nine repros on both hosts).
 * A Radix `Select`'s `onValueChange` fires while its own listbox still carries
 * `data-state="open"` — measured at roughly TWO SECONDS under production
 * scheduling. Opening a confirm from inside that callback produced the worst
 * outcome available: the confirm never appeared, the body stayed pointer-dead
 * for 1-11s, **the person's rung change was silently dropped**, and the queued
 * confirm then fired later on an unrelated click as a stale question about
 * something they had stopped doing. One click, no visible question, no
 * outcome, and an ambush afterwards.
 *
 * WHY THE FIRST TWO ATTEMPTS DID NOT FIX IT, because both looked right:
 *   1. "Wait one animation frame" — a fixed delay is not a close boundary.
 *   2. "Wait until the BODY LOCK is released, two consecutive paints" — closer,
 *      but it asks the wrong object. The body lock is shared, and this repo now
 *      runs a watchdog that deliberately clears an orphaned one; the moment it
 *      does, the wait resolves while the listbox is still open. A guard curing
 *      one symptom satisfied the other's precondition.
 *
 * So the wait asks the LAYERS themselves, through the one predicate the
 * watchdog also uses, and it is not a promise awaited inside an event handler.
 * An awaited promise in a handler is what let a stale confirm survive into an
 * unrelated click. This is an INTENT the caller parks and a caller-owned effect
 * settles: applied, or visibly refused, never dropped and never banked.
 */

import { isAnyModalLayerOpen } from "./body-pointer-events-guard";

export interface DeferredIntentOptions {
  /** Poll interval while a layer is still open. */
  everyMs?: number;
  /** Give up after this long and report it — never wait forever in silence. */
  timeoutMs?: number;
  isOpen?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (handle: number) => void;
}

export type LayerSettleResult = "clear" | "timeout" | "cancelled";

/**
 * Resolve once no modal layer is open — or report why not.
 *
 * `"clear"` means it is safe to open the next layer. `"timeout"` means
 * something stayed open far longer than any close animation, and the caller
 * must say so rather than opening a dialog into a layer that owns the screen.
 * `"cancelled"` means the caller tore this down (the person moved on), and the
 * intent must be discarded — never resurrected later.
 *
 * Deliberately NOT on `requestAnimationFrame`: rAF is suspended in a hidden tab
 * and coalesced under load, and this decides whether a person's click produces
 * a question. It needs a turn of the event loop, not a paint.
 */
export function whenNoLayerIsOpen(
  options: DeferredIntentOptions = {},
): { promise: Promise<LayerSettleResult>; cancel: () => void } {
  const {
    everyMs = 50,
    timeoutMs = 4000,
    isOpen = () => isAnyModalLayerOpen(),
    setTimer = (fn, ms) => window.setTimeout(fn, ms),
    clearTimer = (handle) => window.clearTimeout(handle),
  } = options;

  let handle: number | null = null;
  let settle: ((result: LayerSettleResult) => void) | null = null;
  let waited = 0;

  const promise = new Promise<LayerSettleResult>((resolve) => {
    settle = resolve;
    const tick = () => {
      handle = null;
      if (!settle) return;
      if (!isOpen()) {
        const done = settle;
        settle = null;
        done("clear");
        return;
      }
      if (waited >= timeoutMs) {
        const done = settle;
        settle = null;
        done("timeout");
        return;
      }
      waited += everyMs;
      handle = setTimer(tick, everyMs);
    };
    // First look on the next turn, never synchronously: the caller is usually
    // still inside the closing layer's own event handler right now.
    handle = setTimer(tick, 0);
  });

  return {
    promise,
    cancel: () => {
      if (handle !== null) {
        clearTimer(handle);
        handle = null;
      }
      if (settle) {
        const done = settle;
        settle = null;
        done("cancelled");
      }
    },
  };
}
