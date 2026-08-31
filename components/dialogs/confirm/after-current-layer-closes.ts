/**
 * Let the currently handling overlay commit its close before another modal
 * layer opens. Radix selection callbacks run before their listbox has fully
 * unmounted; opening a Dialog synchronously from that callback overlaps two
 * body-lock owners and can leave document.body pointer-blocked after both
 * layers close.
 */
export function afterCurrentLayerCloses(
  schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame,
): Promise<void> {
  return new Promise((resolve) => {
    schedule(() => resolve());
  });
}
