/**
 * Abort Registry
 *
 * Simple module-level map: conversationId → AbortController.
 * executeInstance registers here so cancelExecution can abort the
 * in-flight fetch from anywhere.
 */

const registry = new Map<string, AbortController>();

/** conversationId → callbacks waiting for that conversation's stream to unregister. */
const releaseWaiters = new Map<string, Set<() => void>>();

function notifyReleased(conversationId: string): void {
  const waiters = releaseWaiters.get(conversationId);
  if (!waiters) return;
  releaseWaiters.delete(conversationId);
  for (const wake of waiters) wake();
}

export function registerAbortController(
  conversationId: string,
  controller: AbortController,
): void {
  registry.set(conversationId, controller);
}

export function ownsAbortController(
  conversationId: string,
  controller: AbortController,
): boolean {
  return registry.get(conversationId) === controller;
}

export function unregisterAbortController(
  conversationId: string,
  controller?: AbortController,
): void {
  if (!controller || ownsAbortController(conversationId, controller)) {
    registry.delete(conversationId);
    notifyReleased(conversationId);
  }
}

export function abortConversation(conversationId: string): void {
  registry.get(conversationId)?.abort();
  registry.delete(conversationId);
  notifyReleased(conversationId);
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

/**
 * Resolves `true` the moment no stream is registered for this conversation
 * (immediately when none is), or `false` after `timeoutMs` if one still is.
 * Event-driven: `resumeInstance` waits on the suspending stream's actual
 * close instead of polling a guessed delay — the server may still be sending
 * the suspended turn's completion + end for several seconds after
 * /tool_results already answered `continuation_needed`.
 */
export function whenAbortControllerReleased(
  conversationId: string,
  timeoutMs: number,
): Promise<boolean> {
  if (!registry.has(conversationId)) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let waiters = releaseWaiters.get(conversationId);
    if (!waiters) {
      waiters = new Set();
      releaseWaiters.set(conversationId, waiters);
    }
    const wake = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      releaseWaiters.get(conversationId)?.delete(wake);
      resolve(!registry.has(conversationId));
    }, timeoutMs);
    waiters.add(wake);
  });
}
