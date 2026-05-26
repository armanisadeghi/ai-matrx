/**
 * Abort Registry
 *
 * Simple module-level map: conversationId → AbortController.
 * executeInstance registers here so cancelExecution can abort the
 * in-flight fetch from anywhere.
 */

const registry = new Map<string, AbortController>();

export function registerAbortController(
  conversationId: string,
  controller: AbortController,
): void {
  registry.set(conversationId, controller);
}

export function unregisterAbortController(conversationId: string): void {
  registry.delete(conversationId);
}

export function abortConversation(conversationId: string): void {
  registry.get(conversationId)?.abort();
  registry.delete(conversationId);
}

/**
 * True when an in-flight stream is registered for this conversation. Used by
 * `resumeInstance` to skip a redundant resume when a stream is already live
 * (e.g. the original turn still going, or a previous resume mid-flight). The
 * server's `continuation_needed=true` already says the original loop is gone,
 * but this is the belt-and-suspenders guard against a client-side double-fire
 * (two POST /tool_results within the same coalesce window each returning true).
 */
export function hasAbortController(conversationId: string): boolean {
  return registry.has(conversationId);
}
