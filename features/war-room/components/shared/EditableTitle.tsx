"use client";

// features/war-room/components/shared/EditableTitle.tsx
//
// Click-to-rename inline title. Shows text; click → input; Enter/blur saves,
// Escape cancels. Used for the War Room session title and each tile's title.

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function EditableTitle({
  value,
  onSave,
  placeholder = "Untitled",
  className,
  inputClassName,
}: {
  value: string;
  onSave: (next: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== value) onSave(next);
    else setDraft(value);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        className={cn(
          "min-w-0 bg-transparent border-b border-primary/50 outline-none text-foreground",
          inputClassName,
          className,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title="Click to rename"
      className={cn(
        "min-w-0 truncate text-left hover:text-primary transition-colors",
        className,
      )}
    >
      {value?.trim() || placeholder}
    </button>
  );
}
