/**
 * Let the currently handling overlay commit its close before another modal
 * layer opens. Radix selection callbacks run before their listbox has fully
 * unmounted; opening a Dialog from that callback overlaps two body-lock owners
 * and can leave document.body pointer-blocked after both layers close.
 *
 * A fixed one-frame delay is not a close boundary: under production scheduling
 * the Select may retain its body lock across more than one paint. Nor is the
 * first unlocked frame sufficient: react-remove-scroll can briefly release the
 * body before the closing layer's cleanup commits its final style write. Require
 * two consecutive closed paints before handing ownership to the next modal.
 */
export function afterCurrentLayerCloses(
  schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  isLayerClosed: () => boolean = () =>
    typeof document === "undefined" ||
    document.body.style.pointerEvents !== "none",
): Promise<void> {
  return new Promise((resolve) => {
    let consecutiveClosedPaints = 0;
    const check = () => {
      if (isLayerClosed()) {
        consecutiveClosedPaints += 1;
        if (consecutiveClosedPaints >= 2) {
          resolve();
          return;
        }
      } else {
        consecutiveClosedPaints = 0;
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
 */
export async function openAfterCurrentLayerCloses(
  open: () => void,
): Promise<void> {
  await afterCurrentLayerCloses();
  open();
}
