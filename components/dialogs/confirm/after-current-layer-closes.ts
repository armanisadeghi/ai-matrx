/**
 * components/dialogs/confirm/after-current-layer-closes.ts
 *
 * THE OWNERSHIP BOUNDARY between one modal layer and the next.
 *
 * Radix selection callbacks run before their listbox has fully unmounted;
 * opening a Dialog from that callback overlaps two body-lock owners and can
 * leave document.body pointer-blocked after both layers close (R2-1). So a
 * layer that is on its way out gets a moment to commit its close first.
 *
 * A fixed one-frame delay is not a close boundary: under production scheduling
 * the Select may retain its body lock across more than one paint. Nor is the
 * first unlocked frame sufficient: react-remove-scroll can briefly release the
 * body before the closing layer's cleanup commits its final style write. Two
 * consecutive closed paints are required before handing ownership on.
 *
 * 🚨 BUT A WAIT MUST NEVER BE UNBOUNDED (feedback 11b0a90c, 2026-09-11).
 *
 * The first cut waited for `document.body.style.pointerEvents` to clear, full
 * stop. An open Radix `DialogContent` holds that lock for its ENTIRE LIFE, so
 * a `confirm()` raised from inside a dialog — a Save button, a Delete button —
 * waited for a condition that could not arrive. The promise never settled, the
 * confirm never rendered, the handler never continued, and at least eight
 * in-dialog handlers looked healthy while writing nothing. A hung promise is
 * the worst failure available here: it is indistinguishable from a broken
 * onClick, and law 4 forbids exactly that.
 *
 * Two changes end the class:
 *
 *   1. ASK WHAT KIND OF LAYER IT IS. A transient layer (Select, menu, popover)
 *      is closing and worth waiting for. A persistent one (Dialog, Sheet,
 *      Drawer) is not going anywhere, and the correct move is to open the next
 *      layer NESTED above it immediately — Radix supports that, and the
 *      body-lock restore is what GUARD 2 in `__tests__/confirm-inside-dialog`
 *      re-proves.
 *   2. BOUND THE WAIT. Even a genuinely transient layer gets a ceiling
 *      (`TRANSIENT_LAYER_WAIT_FRAMES` ≈ 500ms at 60fps). Past it the wait
 *      reports `"timed-out"` and the caller proceeds loudly rather than
 *      disappearing.
 *
 * The outcome is always reported, never swallowed.
 */

import {
  hasPersistentLayer,
  hasTransientLayer,
} from "./body-pointer-events-guard";

/**
 * "clear"     — nothing owns the screen; open the next layer normally.
 * "nested"    — a persistent layer (Dialog/Sheet/Drawer) is open and staying;
 *               open the next layer above it, now.
 * "timed-out" — a layer refused to release inside the bound. Proceed, and say
 *               so; this is a defect worth seeing, not a thing to hide.
 */
export type LayerHandoffOutcome = "clear" | "nested" | "timed-out";

/**
 * ~500ms at 60fps. Long enough for every design-system exit animation (the
 * longest is the 150ms Select), short enough that a person never experiences
 * it as a dead button. Deliberately a FRAME count, because the wait is driven
 * by the paint clock it is measuring.
 */
export const TRANSIENT_LAYER_WAIT_FRAMES = 30;

export function afterCurrentLayerCloses(
  schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  isLayerClosed: () => boolean = () =>
    typeof document === "undefined" ||
    document.body.style.pointerEvents !== "none",
  maxFrames: number = TRANSIENT_LAYER_WAIT_FRAMES,
  layers: {
    persistent: () => boolean;
    transient: () => boolean;
  } = {
    persistent: () =>
      typeof document !== "undefined" && hasPersistentLayer(document),
    transient: () =>
      typeof document !== "undefined" && hasTransientLayer(document),
  },
): Promise<LayerHandoffOutcome> {
  return new Promise((resolve) => {
    let consecutiveClosedPaints = 0;
    let frames = 0;
    const check = () => {
      // A layer that is on its way out still owns the handoff — wait for it,
      // even if a persistent dialog sits underneath (a Select inside a Dialog
      // is both at once, and the Select is the one we must not race).
      if (!layers.transient()) {
        // Nothing transient is up. A persistent layer means "nest now": it
        // will hold the body lock forever, so `isLayerClosed` can never be
        // true and waiting for it is the bug this function exists to end.
        if (layers.persistent()) {
          resolve("nested");
          return;
        }
        if (isLayerClosed()) {
          consecutiveClosedPaints += 1;
          if (consecutiveClosedPaints >= 2) {
            resolve("clear");
            return;
          }
        } else {
          consecutiveClosedPaints = 0;
        }
      } else {
        consecutiveClosedPaints = 0;
      }
      frames += 1;
      if (frames > maxFrames) {
        resolve("timed-out");
        return;
      }
      schedule(check);
    };
    schedule(check);
  });
}

/**
 * Shared producer boundary for a menu/select action that opens another layer.
 * The caller must allow the current Radix item to close normally, then hand
 * the next layer's intent here instead of opening it inside `onSelect`.
 *
 * The intent is ALWAYS applied — a bounded wait that ran out still opens, and
 * says why. Dropping it silently is the failure mode this whole file exists to
 * prevent.
 */
export async function openAfterCurrentLayerCloses(
  open: () => void,
): Promise<LayerHandoffOutcome> {
  const outcome = await afterCurrentLayerCloses();
  if (outcome === "timed-out") {
    console.warn(
      "[modal-layers] a closing layer never released the screen within ~500ms; opening the next layer anyway. If the page feels unresponsive afterwards, reload — and report it: two modal layers are fighting over the body pointer lock.",
    );
  }
  open();
  return outcome;
}
