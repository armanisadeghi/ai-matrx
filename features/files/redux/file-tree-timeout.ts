import {
  isDocumentHidden,
  whenDocumentVisible,
} from "@/lib/dom/document-visibility";

/**
 * A gallery may wait for a real tree read, but it must never own an endless
 * loading state. The shared producer uses this boundary so every tree
 * consumer can retry after a stalled transport.
 */
export const FILE_TREE_LOAD_TIMEOUT_MS = 20_000;
export const FILE_TREE_LOAD_TIMEOUT_MESSAGE =
  "Your file library took too long to load. Try again.";

/** How many times a load that stalled in a hidden tab retries on return. */
const HIDDEN_STALL_RETRIES = 1;

/**
 * The timeout is a FAILURE the person felt, never a cancellation. A bare
 * `controller.abort()` made postgrest report it as the stringified
 * `"AbortError: signal is aborted without reason"` with an empty code — the
 * same shape as a harmless cancel. Abort with a named `TimeoutError` reason and
 * reject the thunk with it, so diagnostics can tell a stalled load from a cancel.
 */
export function fileTreeLoadTimeoutError(): Error {
  const error = new Error(FILE_TREE_LOAD_TIMEOUT_MESSAGE);
  error.name = "TimeoutError";
  return error;
}

const HIDDEN_STALL_NAME = "FileTreeHiddenStall";

/**
 * A load that ran out of time while the tab was HIDDEN. The browser freezes
 * background network, so nobody felt this; it is retried when the person
 * returns (class sec_d904494698f4: a 7h hidden tab reported as an error).
 */
function hiddenStall(): Error {
  const error = new Error(
    "The file library load paused while the tab was hidden.",
  );
  error.name = HIDDEN_STALL_NAME;
  return error;
}

/**
 * Still hidden-stalled after the retry: a deferred cancel, named AbortError so
 * diagnostics treat it as one. The tree goes back to idle and reloads on use.
 */
export function fileTreeLoadDeferredError(): Error {
  const error = new Error(
    "The file library load was deferred while the tab was hidden.",
  );
  error.name = "AbortError";
  return error;
}

export function isFileTreeLoadDeferred(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function createFileTreeLoadTimeout(): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () =>
      controller.abort(
        isDocumentHidden() ? hiddenStall() : fileTreeLoadTimeoutError(),
      ),
    FILE_TREE_LOAD_TIMEOUT_MS,
  );

  return {
    controller,
    dispose: () => globalThis.clearTimeout(timeoutId),
  };
}

/**
 * Run one bounded tree load. A timeout while the tab is visible rejects with
 * `TimeoutError` (a real failure, captured). A timeout while hidden waits for
 * the tab to come back and retries once; hidden-stalled again, it rejects as a
 * deferred cancel. Any other error from `attempt` propagates unchanged.
 */
export async function runWithFileTreeLoadTimeout<T>(
  attempt: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  for (let hiddenRetries = 0; ; hiddenRetries += 1) {
    const { controller, dispose } = createFileTreeLoadTimeout();
    try {
      return await attempt(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) throw error;
      const reason: unknown = controller.signal.reason;
      if (!(reason instanceof Error) || reason.name !== HIDDEN_STALL_NAME) {
        throw fileTreeLoadTimeoutError();
      }
      if (hiddenRetries >= HIDDEN_STALL_RETRIES) {
        throw fileTreeLoadDeferredError();
      }
    } finally {
      dispose();
    }
    await whenDocumentVisible();
  }
}
