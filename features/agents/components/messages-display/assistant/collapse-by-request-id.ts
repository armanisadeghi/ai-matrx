/**
 * Collapse transcript entries that share a live stream source into ONE
 * render each.
 *
 * A multi-iteration agentic turn persists one assistant row per iteration,
 * and process-stream stamps the SAME `_streamRequestId` on every one of
 * them. The stream-anchored renderer (`EnhancedChatMarkdown`'s unified-slot
 * path) renders the ENTIRE request's timeline — so letting each row render
 * with the shared requestId shows the whole turn once PER ROW: the
 * duplicate/triplicate-content-after-stream bug. One render per requestId is
 * the correct cardinality.
 *
 * The LAST row of each requestId run wins (action-bar anchor + edit target
 * stay on the final answer row). Rows without a requestId (DB-hydrated
 * history) pass through untouched. Order is preserved.
 */
export function collapseByRequestId<T extends { requestId: string | null }>(
  items: T[],
): T[] {
  const lastIndexByRequestId = new Map<string, number>();
  items.forEach((item, i) => {
    if (item.requestId) lastIndexByRequestId.set(item.requestId, i);
  });
  if (lastIndexByRequestId.size === 0) return items;
  return items.filter(
    (item, i) =>
      !item.requestId || lastIndexByRequestId.get(item.requestId) === i,
  );
}
