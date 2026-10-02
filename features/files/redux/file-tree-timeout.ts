/**
 * A gallery may wait for a real tree read, but it must never own an endless
 * loading state. The shared producer uses this boundary so every tree
 * consumer can retry after a stalled transport.
 */
export const FILE_TREE_LOAD_TIMEOUT_MS = 20_000;
export const FILE_TREE_LOAD_TIMEOUT_MESSAGE =
  "Your file library took too long to load. Try again.";

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

export function createFileTreeLoadTimeout(): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(fileTreeLoadTimeoutError()),
    FILE_TREE_LOAD_TIMEOUT_MS,
  );

  return {
    controller,
    dispose: () => globalThis.clearTimeout(timeoutId),
  };
}
