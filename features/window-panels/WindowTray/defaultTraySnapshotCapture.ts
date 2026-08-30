/**
 * defaultTraySnapshotCapture — the fleet-wide fallback `captureTraySnapshot`.
 *
 * Any window WITHOUT a custom `renderTrayPreview` gets this capture so its
 * minimized card shows a representative image of the actual body instead of
 * the generic placeholder. Windows with a semantic preview keep it (better
 * fidelity at zero render cost) and never pay for a capture.
 *
 * Performance contract (do not weaken any of these when editing):
 *  - Runs exactly ONCE per minimize, against the briefly retained offscreen
 *    body, inside WindowPanel's existing timeout race. No polling, no
 *    network, no persistent storage — the Blob lands in the bounded
 *    object-URL cache (`traySnapshotMap`, 16 entries, revoked on restore).
 *  - `html-to-image` loads only on the first capture (dynamic import), so
 *    minimize-preview support adds nothing to the window-panels chunk.
 *  - Oversized DOM subtrees are skipped entirely (the clone phase of a
 *    DOM-to-canvas render is synchronous and would jank the main thread);
 *    the chip then falls back to the styled default body.
 *  - Output is downscaled (320px longest edge, 1x pixel density) WebP.
 */

/**
 * Skip capture above this many descendant elements — the synchronous clone
 * pass on a subtree this size risks a visible main-thread stall.
 */
const MAX_CAPTURE_ELEMENT_COUNT = 3000;

export async function defaultTraySnapshotCapture(
  bodyEl: HTMLElement,
): Promise<Blob | null> {
  try {
    if (
      bodyEl.querySelectorAll("*").length > MAX_CAPTURE_ELEMENT_COUNT ||
      bodyEl.offsetWidth < 8 ||
      bodyEl.offsetHeight < 8
    ) {
      return null;
    }
    const { captureElementThumbnail } = await import(
      "@/hooks/useScreenCapture"
    );
    return await captureElementThumbnail(bodyEl);
  } catch {
    // A failed capture is never worth breaking minimize over — the chip
    // falls back to the default preview body.
    return null;
  }
}
