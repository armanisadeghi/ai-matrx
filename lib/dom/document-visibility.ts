/**
 * Document visibility primitives. A hidden tab's network is frozen or
 * throttled by the browser, so background work that runs (or times out) while
 * hidden is work nobody watched: defer it to the moment the person returns.
 * SSR-safe: with no `document`, the page counts as visible.
 */

export function isDocumentHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

/**
 * Run `run` once, the next time the tab is visible (immediately if it already
 * is). Returns a cancel that drops a run still waiting.
 */
export function onceDocumentVisible(run: () => void): () => void {
  if (!isDocumentHidden()) {
    run();
    return () => {};
  }
  const onChange = () => {
    if (isDocumentHidden()) return;
    document.removeEventListener("visibilitychange", onChange);
    run();
  };
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** Resolves the next time the tab is visible (now, if it already is). */
export function whenDocumentVisible(): Promise<void> {
  return new Promise((resolve) => {
    onceDocumentVisible(resolve);
  });
}
