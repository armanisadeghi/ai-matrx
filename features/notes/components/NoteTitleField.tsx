"use client";

// NoteTitleField — a note's title, click to rename. For a host that shows ONE
// note and names it in its own header (a Board tile) or at the start of the
// note's tool row (NoteWorkspace `title="inline"`). The /notes tab renders the
// same behaviour inside its tab (both use useNoteTitleEditing).
//
// The field sizes to its text, so the rest of a host header stays a drag
// handle. A hidden mirror of the name (same font, same padding) gives the
// wrapper its width and the input fills that wrapper: CSS `field-sizing`
// measured a few px short inside a scaled Board tile (ellipsis with room to
// spare), and filling the header slot instead made the whole header a text
// control that no longer dragged the tile. The mirror measures with the
// browser's own text layout, so neither happens. `className` sizes the
// wrapper (max-w, shrink).

import { cn } from "@/lib/utils";
import { useNoteTitleEditing } from "../hooks/useNoteTitleEditing";

export interface NoteTitleFieldProps {
  noteId: string;
  className?: string;
}

export function NoteTitleField({ noteId, className }: NoteTitleFieldProps) {
  const title = useNoteTitleEditing(noteId);
  return (
    <span className={cn("inline-grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)]", className)}>
      <span
        aria-hidden
        data-note-title-mirror
        className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre px-1 pr-2 text-sm font-medium"
      >
        {title.localLabel || " "}
      </span>
      <input
        data-note-title-input
        className={cn(
          "col-start-1 row-start-1 w-full min-w-0 truncate rounded-sm border-none bg-transparent px-1 text-sm font-medium text-foreground outline-none",
          title.titleEditing ? "cursor-text ring-1 ring-ring" : "hover:bg-accent/50",
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
    </span>
  );
}
