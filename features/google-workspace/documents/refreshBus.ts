/**
 * ONE refresh, TWO places that can start it, ONE place that shows the result.
 *
 * The Detail primitive's health strip owns the `Refresh` button (its
 * `onRefresh`), and the strip is produced from the row, outside React state — it
 * has no way to make the panel below it re-read. Without this, pressing Refresh
 * would spend a Google call and change nothing on screen: a control that lies
 * (law 4). So every refresh of a document announces itself here and the panel
 * re-reads that record's row.
 *
 * Deliberately not Redux: there is no global state to keep, only a "this id just
 * changed" notification between two components of the same panel.
 */

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribeToDocumentRefresh(id: string, listener: Listener): () => void {
  const set = listeners.get(id) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(id, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(id);
  };
}

export function announceDocumentRefreshed(id: string): void {
  for (const listener of [...(listeners.get(id) ?? [])]) listener();
}

/** Test seam. */
export function resetDocumentRefreshListeners(): void {
  listeners.clear();
}
