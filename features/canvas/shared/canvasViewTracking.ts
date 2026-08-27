/**
 * Canonical-RLS canvas view rows are actor-owned entities. Public-share guests
 * have no actor and must never attempt a direct insert into canvas.canvas_views.
 */
export function getCanvasViewScope(
  userId: string | null,
  organizationId: string | null,
): { userId: string; organizationId: string } | null {
  return userId && organizationId ? { userId, organizationId } : null;
}
