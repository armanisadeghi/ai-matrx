"use client";

/**
 * The swipe file's note + tags editor: "why saved" and comma-separated tags.
 * ONE component for the item sheet and both save dialogs, so a saved item's
 * note and tags are captured the same way wherever it is saved from.
 */

import { Field, Textarea } from "@ai-matrx/design-system/controls";

export function NoteTagsFields({
  note,
  tagText,
  onNoteChange,
  onTagTextChange,
  disabled,
  autoFocusNote,
}: {
  note: string;
  tagText: string;
  onNoteChange: (value: string) => void;
  onTagTextChange: (value: string) => void;
  disabled?: boolean;
  autoFocusNote?: boolean;
}) {
  return (
    <>
      <Textarea
        aria-label="Why saved"
        placeholder="Why saved"
        rows={3}
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        disabled={disabled}
        autoFocus={autoFocusNote}
      />
      <Field
        aria-label="Tags"
        placeholder="Tags, separated by commas"
        value={tagText}
        onChange={(e) => onTagTextChange(e.target.value)}
        disabled={disabled}
      />
    </>
  );
}
