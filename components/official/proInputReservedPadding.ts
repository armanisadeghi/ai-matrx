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

/**
 * A NARROW FIELD NEVER LETS A HOVER STEAL ITS CLICK.
 *
 * The mic + "…" cluster fades in on pointer hover over the right end of the
 * field. In a field only a couple of hundred px wide (a board tile's task-add
 * row, a sidebar) the cluster and its reserved padding leave a sliver of text,
 * and a press aimed at the middle of the field lands ON the mic: no focus, no
 * typing. Below this width the cluster appears on FOCUS instead of hover, so
 * the first press always focuses the field.
 */
export const PRO_INPUT_NARROW_FIELD_PX = 260;

export function hoverRevealsCluster(inputWidth: number): boolean {
  return !(inputWidth > 0 && inputWidth < PRO_INPUT_NARROW_FIELD_PX);
}

/**
 * THE CLUSTER FITS THE ROOM IT HAS (owner, 2026-10-04: the input "has
 * ABSOLUTELY no sense of the total space so if there is no room, it has no
 * problem fully occupying 100% of the available space").
 *
 * The hover cluster may take at most a fraction of the room left after the
 * always-visible controls (clear, submit). It steps down as the room shrinks:
 *
 *  - `full`  — mic capsule (with its device chevron) + "…";
 *  - `menu`  — only "…"; voice input and the microphone choice move inside it;
 *  - `none`  — nothing: the field is too small to give any of it away.
 *
 * A width of 0 means "not measured yet" (first paint, jsdom) → `full`.
 */
export type ProInputClusterTier = "full" | "menu" | "none";

/** Widths the cluster takes per tier, px (measured on a fine pointer, 2026-10-04: 87px). */
export const PRO_INPUT_FULL_CLUSTER_PX = 88;
export const PRO_INPUT_MENU_CLUSTER_PX = 38;
/** The most of the free room the hover cluster may ever take. */
export const PRO_INPUT_CLUSTER_MAX_SHARE = 0.4;

export function proInputClusterTier(
  inputWidth: number,
  persistentWidth = 0,
): ProInputClusterTier {
  if (!(inputWidth > 0)) return "full";
  const room = Math.max(0, inputWidth - Math.max(0, persistentWidth));
  const budget = room * PRO_INPUT_CLUSTER_MAX_SHARE;
  if (budget >= PRO_INPUT_FULL_CLUSTER_PX) return "full";
  if (budget >= PRO_INPUT_MENU_CLUSTER_PX) return "menu";
  return "none";
}
