// Cross-layer "the user is typing this note's title RIGHT NOW" signal.
//
// The title input is a React component; the auto-labeler lives in Redux
// middleware (autoSaveMiddleware) with no access to focus state. Without
// this signal, a paste-then-name flow raced: the autosave fired while the
// user was typing the name, saw the still-default label in Redux, generated
// one from content, and the Redux→local sync clobbered the user's
// in-progress title ("the system freaks out about naming").
//
// Rule (see FEATURE.md § naming): while the title input is focused, the
// user's buffer is authoritative — auto-label must not fire and Redux must
// not overwrite the input. On blur, the user's entry (if any) is committed;
// an emptied input reverts to the already-assigned label.

const editing = new Set<string>();

export function setNoteLabelEditing(noteId: string, isEditing: boolean): void {
  if (isEditing) editing.add(noteId);
  else editing.delete(noteId);
}

export function isNoteLabelEditing(noteId: string): boolean {
  return editing.has(noteId);
}
