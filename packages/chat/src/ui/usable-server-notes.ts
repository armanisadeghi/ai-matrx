/** The sentences worth printing — the server's words, minus anything blank. */
export function usableServerNotes(notes: readonly unknown[]): string[] {
  return notes.filter(
    (note): note is string => typeof note === "string" && note.trim().length > 0,
  );
}
