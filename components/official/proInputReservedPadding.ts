/**
 * THE TOOLBAR NEVER COVERS TEXT (page-pass 2026-09-27, /chat/message-templates/<id> at 375px).
 *
 * ProInput's mic + "…" cluster fades in over the right end of the field. On a
 * phone a tap counts as a hover and stays one, so the cluster sat on top of the
 * text being typed and clipped it. The fix is to reserve exactly the width the
 * visible right-hand controls take — measured, never guessed — as the input's
 * right padding:
 *
 *  - the whole cluster while the mic / "…" part is showing;
 *  - only the always-visible part (clear, submit) while it is faded out — the
 *    faded part still takes layout width, so it is subtracted, not ignored.
 *
 * `null` means "nothing measured yet" (first paint, jsdom): the caller keeps its
 * class-based fallback padding.
 */
export const PRO_INPUT_TEXT_GAP_PX = 4;
export const PRO_INPUT_MIN_RIGHT_PADDING_PX = 12;

export function reservedRightPaddingPx({
  clusterWidth,
  auxWidth,
  auxVisible,
}: {
  clusterWidth: number;
  auxWidth: number;
  auxVisible: boolean;
}): number | null {
  if (!(clusterWidth > 0)) return null;
  const visible = auxVisible
    ? clusterWidth
    : Math.max(0, clusterWidth - Math.max(0, auxWidth));
  if (visible <= 0) return PRO_INPUT_MIN_RIGHT_PADDING_PX;
  return Math.max(
    PRO_INPUT_MIN_RIGHT_PADDING_PX,
    Math.ceil(visible) + PRO_INPUT_TEXT_GAP_PX,
  );
}
