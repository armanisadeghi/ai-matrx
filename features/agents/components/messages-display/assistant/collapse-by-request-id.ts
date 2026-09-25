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

/**
 * The members a turn renders when a person is editing (or has edited) one of
 * its rows (RC-B5).
 *
 * A stream-anchored member renders the WHOLE request — every iteration's text
 * from one source — so (a) the row being edited has no spot of its own when a
 * later row of the same request won the collapse, and (b) an edit's
 * `activeRequests.editedText` replaces the whole request's text with that one
 * row's. Rendering the turn from its persisted rows (one member per row, no
 * stream source) gives every row its own spot and its own stored content.
 * A turn with no multi-row request keeps the stream path: a single row edits
 * against its own request without either problem.
 */
export function membersForRender<T extends { requestId: string | null }>(
  items: T[],
  persistedView: boolean,
): T[] {
  if (!persistedView) return collapseByRequestId(items);
  const rowsPerRequest = new Map<string, number>();
  for (const item of items) {
    if (item.requestId) rowsPerRequest.set(item.requestId, (rowsPerRequest.get(item.requestId) ?? 0) + 1);
  }
  if (![...rowsPerRequest.values()].some((count) => count > 1)) return collapseByRequestId(items);
  return items.map((item) => ({ ...item, requestId: null }));
}
