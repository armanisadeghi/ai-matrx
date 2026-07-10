// Live (pre-debounce) note body for UI that must track keystrokes —
// e.g. NoteStatsFooter. Editor writes here on every change; footer
// subscribes via useSyncExternalStore. Redux remains the source of
// truth for persistence; this is display-only.

const contentById = new Map<string, string>();
const listenersById = new Map<string, Set<() => void>>();

function emit(noteId: string) {
  const listeners = listenersById.get(noteId);
  if (!listeners) return;
  for (const listener of listeners) listener();
}

/** Called from the editor on every keystroke (and on unmount clear). */
export function setNoteLiveContent(noteId: string, content: string | null) {
  if (content === null) {
    if (!contentById.has(noteId)) return;
    contentById.delete(noteId);
  } else {
    if (contentById.get(noteId) === content) return;
    contentById.set(noteId, content);
  }
  emit(noteId);
}

export function getNoteLiveContent(noteId: string): string | undefined {
  return contentById.get(noteId);
}

export function subscribeNoteLiveContent(
  noteId: string,
  listener: () => void,
): () => void {
  let set = listenersById.get(noteId);
  if (!set) {
    set = new Set();
    listenersById.set(noteId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listenersById.delete(noteId);
  };
}
