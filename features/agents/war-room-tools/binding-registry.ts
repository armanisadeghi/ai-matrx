/**
 * War Room tool binding registry.
 *
 * The war-room write tools run keyed on `conversationId` (the only id the
 * stream-event funnel carries), but they need to know WHICH TILE's entities to
 * mutate. This module-level map resolves that: `conversationId → tileId`.
 *
 * Why outside Redux (mirrors `ui-first-tools/redux/ask-resolver-registry.ts`):
 * this is pure runtime wiring between a live panel and its delegated-tool
 * handlers, not serializable app state. The panel (`TileAgentPanel`) is the one
 * place that knows BOTH ids — it owns the tile and resolves the tile's
 * studio-assistant `conversationId` via `useStudioAssistant`. On mount it
 * registers the binding (and arms the war-room tools on that conversation); on
 * unmount it clears it.
 *
 * A tile's assistant conversation is durable and 1:1 with the tile's audio
 * session, so the mapping is stable for the panel's lifetime. If a stale or
 * missing binding is ever hit at dispatch time, the dispatcher treats it as a
 * loud error (submits a declined/`no_tile_bound` tool result) rather than
 * guessing a tile — a write to the wrong tile is far worse than a no-op.
 */

const conversationToTile = new Map<string, string>();

/** Bind a war-room agent conversation to the tile whose entities it may edit. */
export function registerWarRoomToolBinding(
  conversationId: string,
  tileId: string,
): void {
  if (!conversationId || !tileId) return;
  conversationToTile.set(conversationId, tileId);
}

/** Resolve the tile a war-room conversation is allowed to edit (or null). */
export function getTileForConversation(conversationId: string): string | null {
  return conversationToTile.get(conversationId) ?? null;
}

/**
 * Clear a conversation's binding (panel unmount). Idempotent. We only delete
 * when the current binding still points at the expected tile so a fast
 * remount that re-registered a new binding for the same conversation isn't
 * clobbered by the previous instance's cleanup.
 */
export function clearWarRoomToolBinding(
  conversationId: string,
  expectedTileId?: string,
): void {
  if (!conversationId) return;
  if (
    expectedTileId &&
    conversationToTile.get(conversationId) !== expectedTileId
  ) {
    return;
  }
  conversationToTile.delete(conversationId);
}
