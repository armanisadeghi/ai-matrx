/**
 * A canvas view is recorded only for a signed-in viewer, through the
 * canvas.record_canvas_view door, in the organization the viewer has SELECTED
 * (a passive page view never holds the page on an organization prompt; with no
 * selection yet, no view is recorded). Public-share guests record nothing —
 * the share-token resolver records guest token access — and nobody writes
 * canvas.canvas_views directly (it refuses client writes).
 */
export function getCanvasViewScope(
  userId: string | null,
  organizationId: string | null,
): { userId: string; organizationId: string } | null {
  return userId && organizationId ? { userId, organizationId } : null;
}
