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

/** The slice of a message row the render decision reads. */
export interface TurnRowState {
  status?: string;
  _editingInPlace?: boolean | "expanded";
}

/**
 * Whether a turn renders from its persisted rows (one member per row, no
 * stream source) instead of one collapsed stream-anchored member. True when:
 *
 * - A person is editing (or has edited) one of its rows (RC-B5), or
 * - Its stream has SETTLED: no member is streaming and every stream-anchored
 *   row is committed (no longer `reserved`). A settled member renders from
 *   its OWN committed record ("the final screen is the reload",
 *   `renderSettledFromRecord`), so the collapsed single member would show
 *   only the last row's parts — every earlier iteration's tool cards, text
 *   and thinking vanished the moment the answer completed and came back only
 *   on reload (verifier 2026-09-26 r2, Defect 1). Rendering every row gives
 *   the settled turn exactly the reload's members.
 *
 * While any row is still streaming or only reserved, the collapsed stream
 * member stays: it renders the whole request from the live source, so
 * nothing is missing in between.
 */
export function rendersFromPersistedRows(
  members: ReadonlyArray<{
    messageId: string | null;
    requestId: string | null;
    isStreamActive: boolean;
  }>,
  rowsById: Readonly<Record<string, TurnRowState | undefined>> | undefined,
): boolean {
  const edited = members.some((m) => {
    if (!m.messageId || m.isStreamActive) return false;
    const row = rowsById?.[m.messageId];
    return !!row?._editingInPlace || row?.status === "edited";
  });
  if (edited) return true;
  const anchored = members.filter((m) => m.requestId);
  return (
    anchored.length > 1 &&
    anchored.every((m) => {
      if (!m.messageId || m.isStreamActive) return false;
      const row = rowsById?.[m.messageId];
      return !!row && row.status !== "reserved";
    })
  );
}

/**
 * The members a turn renders. `persistedView` (see `rendersFromPersistedRows`:
 * an edited row, or a settled multi-row request) renders one member per row;
 * otherwise one stream-anchored member per request.
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
