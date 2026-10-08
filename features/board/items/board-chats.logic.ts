/**
 * Which conversations belong to a board — pure helpers over the association
 * edges (`conversation → board`, platform.associations). The list in a chat tile
 * shows exactly these.
 */

export const BOARD_CHAT_SOURCE = "conversation";
export const BOARD_TARGET = "board";

/** The conversations an edge list names for a board (unique, newest edge first as read). */
export function chatIdsFromEdges(edges: readonly { sourceType: string; sourceId: string }[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const e of edges) {
    if (e.sourceType !== BOARD_CHAT_SOURCE || seen.has(e.sourceId)) continue;
    seen.add(e.sourceId);
    ids.push(e.sourceId);
  }
  return ids;
}

/** The set with `id` added (same array when already there). */
export function withChat(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? (ids as string[]) : [...ids, id];
}

/** The set without `id` (same array when not there). */
export function withoutChat(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : (ids as string[]);
}
