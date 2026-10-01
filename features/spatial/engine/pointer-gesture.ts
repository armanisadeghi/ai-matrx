/**
 * One pointer gesture (a resize, a tile drag) that can NEVER get stuck.
 *
 * A gesture that ends only when one `pointerup` reaches one element stays
 * open forever when that event is missed — the pointer released over an
 * iframe, a trackpad's tap-drag, the window losing focus, an element replaced
 * mid-drag — and whatever it put up (a page-wide shield, a resize cursor)
 * stays with it: the page looks frozen. This ends a gesture on EVERY way a
 * press can end:
 *   pointerup · pointercancel · lostpointercapture on the capturing element ·
 *   window blur · the page hidden · Escape (puts it back) · and, self-healing, the
 *   first pointermove that reports the button is no longer down.
 * Listeners sit on `window` in the capture phase, so nothing below can
 * swallow them. Ending is idempotent; `dispose` (unmount) ends it too.
 */

/** `escape` = the person asked to undo the gesture (put it back where it began). */
export type GestureEnd = "up" | "cancel" | "escape";

export interface PointerGestureHandlers {
  onMove: (e: PointerEvent) => void;
  /** Exactly once. `cancel` = the press ended without a real release (blur,
   * lost capture, a release that was never delivered): keep where it got to. */
  onEnd: (how: GestureEnd, e: PointerEvent | null) => void;
}

/** Start a gesture from its pointerdown. Returns a dispose that ends it as a cancel. */
export function startPointerGesture(
  down: PointerEvent,
  capturer: HTMLElement,
  handlers: PointerGestureHandlers,
): () => void {
  const pointerId = down.pointerId;
  // The button that started it; a mouse move without it means it was released.
  const buttonMask = down.button === 1 ? 4 : down.button === 2 ? 2 : 1;
  let ended = false;

  try {
    capturer.setPointerCapture(pointerId);
  } catch {
    // An unknown pointer (synthetic event): the window listeners still end it.
  }

  const finish = (how: GestureEnd, e: PointerEvent | null) => {
    if (ended) return;
    ended = true;
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("keydown", onKey, true);
    document.removeEventListener("visibilitychange", onHidden);
    capturer.removeEventListener("lostpointercapture", onLost);
    try {
      if (capturer.hasPointerCapture?.(pointerId)) capturer.releasePointerCapture(pointerId);
    } catch {
      // Already released.
    }
    handlers.onEnd(how, e);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    if (e.pointerType === "mouse" && (e.buttons & buttonMask) === 0) {
      finish("cancel", e); // the release never reached us; end where it is
      return;
    }
    handlers.onMove(e);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId === pointerId) finish("up", e);
  };
  const onCancel = (e: PointerEvent) => {
    if (e.pointerId === pointerId) finish("cancel", e);
  };
  const onLost = (e: PointerEvent) => {
    // Capture is released implicitly right after pointerup; let the up win.
    // lostpointercapture bubbles: only the capturer's own loss ends it.
    if (e.pointerId === pointerId && e.target === capturer) queueMicrotask(() => finish("cancel", null));
  };
  const onBlur = () => finish("cancel", null);
  const onHidden = () => {
    if (document.visibilityState === "hidden") finish("cancel", null);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    finish("escape", null);
  };

  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onCancel, true);
  window.addEventListener("blur", onBlur);
  window.addEventListener("keydown", onKey, true);
  document.addEventListener("visibilitychange", onHidden);
  capturer.addEventListener("lostpointercapture", onLost);

  return () => finish("cancel", null);
}
