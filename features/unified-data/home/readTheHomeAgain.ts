// features/unified-data/home/readTheHomeAgain.ts — lane TABLE-ACTIONS (wave 1 fix round)
//
// A TABLE BROUGHT BACK IS LISTED AT ONCE. The archive announcement's Undo — the toast's button and
// ⌘Z, both the same `undo` (`lib/reversible`) — restores the table through records-ui's client, and
// the Data home must list it again without a reload. The undo runs in whatever page is showing
// (the table page has already left for the list), so the signal is page-wide: the host's notify
// port wraps every undo and calls `readTheHomeAgain()` once it succeeds; the Data home listens.

type Listener = () => void;
const listeners = new Set<Listener>();

/** A restore landed: every Data home on this page reads its list again. */
export function readTheHomeAgain(): void {
  for (const listener of [...listeners]) listener();
}

/** Hear every restore. Returns the unsubscribe. */
export function onReadTheHomeAgain(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
