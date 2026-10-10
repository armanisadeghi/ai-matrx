"use client";

// NoteTitleField — a note's title, click to rename. For a host that shows ONE
// note and names it in its own header (a Board tile) or at the start of the
// note's tool row (NoteWorkspace `title="inline"`). The /notes tab renders the
// same behaviour inside its tab (both use useNoteTitleEditing).
//
// The field sizes to its text, so the rest of a host header stays a drag
// handle. (Inside a scaled Board tile field-sizing measures a few px short and
// the name ended in an ellipsis with room to spare, so the tile passes
// `w-full [field-sizing:fixed]` and fills its header slot instead.)

import { cn } from "@/lib/utils";
import { useNoteTitleEditing } from "../hooks/useNoteTitleEditing";

export interface NoteTitleFieldProps {
  noteId: string;
  className?: string;
}

export function NoteTitleField({ noteId, className }: NoteTitleFieldProps) {
  const title = useNoteTitleEditing(noteId);
  return (
    <input
      className={cn(
        "field-sizing-content min-w-0 max-w-full truncate rounded-sm border-none bg-transparent px-1 text-sm font-medium text-foreground outline-none",
        title.titleEditing ? "cursor-text ring-1 ring-ring" : "hover:bg-accent/50",
        className,
      )}
      readOnly={!title.titleEditing}
      value={title.localLabel}
      onChange={title.onChange}
      onClick={() => title.setTitleEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          if (title.titleEditing) e.currentTarget.blur();
          else title.setTitleEditing(true);
        }
        // Escape = changed my mind: back to the saved name.
        if (e.key === "Escape" && title.titleEditing) {
          title.revert();
          e.currentTarget.blur();
        }
      }}
      onFocus={title.onFocus}
      onBlur={title.onBlur}
      aria-label="Note title"
      title="Rename note"
      spellCheck={false}
    />
  );
}
