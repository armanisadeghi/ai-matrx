/**
 * THE RECORD CHANGE BUS — one write, every screen tells the truth.
 *
 * 🚨 A SAVE INVALIDATES EVERY SIBLING'S COUNT, NOT ONLY ITS OWN.
 *
 * Two wine tastings in one chat draw two independent record strips, each
 * holding its own copy of "how many does this organization have". Saving the
 * first one left the SECOND still reading "Save this as the first one" — false
 * at the moment it was on screen, and corrected only by a full page reload
 * (V-42 §3.1). A screen never lies, so every record write announces itself here
 * and every view that prints a count listens.
 *
 * Deliberately a module-level bus and not Redux: this is cache invalidation,
 * not application state — there is nothing to select, persist or time-travel,
 * and the listeners are ephemeral views of a server-side count.
 */

/** `kind` is the slug that changed, or null when the writer cannot name one. */
export type KindRecordsChangedListener = (kind: string | null) => void;

const listeners = new Set<KindRecordsChangedListener>();

/**
 * Listen for record writes. A `null` kind means EVERY listener must re-read,
 * because the writer worked by id and any of them could be the one affected.
 */
export function subscribeToKindRecordChanges(
  listener: KindRecordsChangedListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Announce that records changed. Called by every client write path. */
export function notifyKindRecordsChanged(kind: string | null): void {
  for (const listener of [...listeners]) listener(kind);
}
