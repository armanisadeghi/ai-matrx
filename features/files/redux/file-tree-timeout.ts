/**
 * A gallery may wait for a real tree read, but it must never own an endless
 * loading state. The shared producer uses this boundary so every tree
 * consumer can retry after a stalled transport.
 */
export const FILE_TREE_LOAD_TIMEOUT_MS = 20_000;
export const FILE_TREE_LOAD_TIMEOUT_MESSAGE =
  "Your file library took too long to load. Try again.";

export function createFileTreeLoadTimeout(): {
  controller: AbortController;
  dispose: () => void;
} {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    FILE_TREE_LOAD_TIMEOUT_MS,
  );

  return {
    controller,
    dispose: () => globalThis.clearTimeout(timeoutId),
  };
}
