/**
 * War Room thread-target registry.
 *
 * The war-room write tools run keyed on `conversationId` (the only id the
 * stream-event funnel carries), but they need to know WHICH THREAD's entities to
 * mutate. This module-level map resolves that: `conversationId → threadId`.
 *
 * Why outside Redux (mirrors `ui-first-tools/redux/ask-resolver-registry.ts`):
 * this is pure runtime wiring between a live panel and its delegated-tool
 * handlers, not serializable app state. The panel (`ThreadAgentPanel`) is the one
 * place that knows BOTH ids — it owns the thread and resolves the thread's
 * studio-assistant `conversationId` via `useStudioAssistant`. On mount it
 * registers the target (and arms the war-room tools on that conversation); on
 * unmount it clears it.
 *
 * A thread's assistant conversation is durable and 1:1 with the thread's audio
 * session, so the mapping is stable for the panel's lifetime. If a stale or
 * missing target is ever hit at dispatch time, the dispatcher treats it as a
 * loud error (submits a declined/`no_thread_target` tool result) rather than
 * guessing a thread — a write to the wrong thread is far worse than a no-op.
 */

const conversationToThread = new Map<string, string>();

/** Register the thread a War Room conversation is allowed to edit. */
export function registerWarRoomThreadTarget(
  conversationId: string,
  threadId: string,
): void {
  if (!conversationId || !threadId) return;
  conversationToThread.set(conversationId, threadId);
}

/** Resolve the thread a War Room conversation is allowed to edit (or null). */
export function getWarRoomThreadTarget(conversationId: string): string | null {
  return conversationToThread.get(conversationId) ?? null;
}

/**
 * Clear a conversation's target (panel unmount). Idempotent. We only delete
 * when the current target still points at the expected thread so a fast
 * remount that registered a new target for the same conversation isn't
 * clobbered by the previous instance's cleanup.
 */
export function clearWarRoomThreadTarget(
  conversationId: string,
  expectedThreadId?: string,
): void {
  if (!conversationId) return;
  if (
    expectedThreadId &&
    conversationToThread.get(conversationId) !== expectedThreadId
  ) {
    return;
  }
  conversationToThread.delete(conversationId);
}
