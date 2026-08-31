/**
 * Let the currently handling overlay commit its close before another modal
 * layer opens. Radix selection callbacks run before their listbox has fully
 * unmounted; opening a Dialog from that callback overlaps two body-lock owners
 * and can leave document.body pointer-blocked after both layers close.
 *
 * A fixed one-frame delay is not a close boundary: under production scheduling
 * the Select may retain its body lock across more than one paint. Wait for the
 * lock itself to be released, which is the condition the next modal needs.
 */
export function afterCurrentLayerCloses(
  schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  isLayerClosed: () => boolean = () =>
    typeof document === "undefined" ||
    document.body.style.pointerEvents !== "none",
): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (isLayerClosed()) {
        resolve();
        return;
      }
      schedule(check);
    };
    schedule(check);
  });
}
