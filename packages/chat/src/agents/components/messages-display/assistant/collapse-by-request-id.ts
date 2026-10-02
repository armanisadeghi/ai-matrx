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
export function collapseByRequestId<
  T extends { requestId: string | null; key?: string; messageId?: string | null },
>(items: T[]): Array<T & { recordMessageIds?: string[] }> {
  const lastIndexByRequestId = new Map<string, number>();
  const rowsByRequestId = new Map<string, string[]>();
  items.forEach((item, i) => {
    if (!item.requestId) return;
    lastIndexByRequestId.set(item.requestId, i);
    if (item.messageId) {
      const rows = rowsByRequestId.get(item.requestId) ?? [];
      rows.push(item.messageId);
      rowsByRequestId.set(item.requestId, rows);
    }
  });
  if (lastIndexByRequestId.size === 0) return items;
  const out: Array<T & { recordMessageIds?: string[] }> = [];
  items.forEach((item, i) => {
    if (!item.requestId) {
      out.push(item);
      return;
    }
    if (lastIndexByRequestId.get(item.requestId) !== i) return;
    // ONE identity per request for the request's whole life: while rows are
    // announced one by one (often after their iteration ran) the winning row
    // changes, but the rendered member must not — a key built from the row id
    // unmounted the whole answer, tool cards included, every time a later row
    // arrived. The member stands for every row of the request: settled, it
    // renders all of their records (`recordMessageIds`).
    out.push({
      ...item,
      key: `req:${item.requestId}`,
      recordMessageIds: rowsByRequestId.get(item.requestId) ?? [],
    });
  });
  return out;
}

/** The slice of a message row the render decision reads. */
export interface TurnRowState {
  status?: string;
  _editingInPlace?: boolean | "expanded";
}

/**
 * Whether a turn renders from its persisted rows (one member per row, no
 * stream source) instead of one collapsed stream-anchored member: a person is
 * editing (or has edited) one of its rows (RC-B5).
 *
 * A SETTLED turn does not need it: the collapsed member renders every row's
 * committed record (`recordMessageIds`, one run per row), which is what a
 * reload shows — while staying the same instance it was live.
 */
export function rendersFromPersistedRows(
  members: ReadonlyArray<{
    messageId: string | null;
    requestId: string | null;
    isStreamActive: boolean;
  }>,
  rowsById: Readonly<Record<string, TurnRowState | undefined>> | undefined,
): boolean {
  return members.some((m) => {
    if (!m.messageId || m.isStreamActive) return false;
    const row = rowsById?.[m.messageId];
    return !!row?._editingInPlace || row?.status === "edited";
  });
}

/**
 * The members a turn renders. `persistedView` (an edited row, see
 * `rendersFromPersistedRows`) renders one member per row; otherwise one
 * stream-anchored member per request.
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
export function membersForRender<
  T extends { requestId: string | null; key?: string; messageId?: string | null },
>(items: T[], persistedView: boolean): Array<T & { recordMessageIds?: string[] }> {
  if (!persistedView) return collapseByRequestId(items);
  const rowsPerRequest = new Map<string, number>();
  for (const item of items) {
    if (item.requestId) rowsPerRequest.set(item.requestId, (rowsPerRequest.get(item.requestId) ?? 0) + 1);
  }
  if (![...rowsPerRequest.values()].some((count) => count > 1)) return collapseByRequestId(items);
  return items.map((item) => ({ ...item, requestId: null }));
}
