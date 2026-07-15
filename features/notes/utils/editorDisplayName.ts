// Display name for a realtime note editor. We only have the editor's email
// (resolved from `updated_by` via `get_user_emails_by_ids`) — show the
// local part; fall back to "Someone" while the lookup is in flight.

import type { NoteEditorPresence } from "../redux/notes.types";

export function editorDisplayName(
  editor: NoteEditorPresence | undefined,
): string {
  if (!editor?.email) return "Someone";
  const localPart = editor.email.split("@")[0];
  return localPart || editor.email;
}
