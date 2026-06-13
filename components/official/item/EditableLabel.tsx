"use client";

/**
 * EditableLabel — inline rename-in-place text.
 *
 * Generalized from features/transcript-studio's EditableSessionTitle: commit on
 * Enter/blur, Esc cancels, whitespace-only falls back to `emptyFallback` (or
 * cancels), stays in sync with upstream `value` while not editing. Decoupled
 * from Redux — `onCommit(next)` is the only side-effect channel.
 *
 * Three activation modes:
 *   - "click"        → click the display text to edit (header titles)
 *   - "doubleClick"  → double-click to edit (rows where single-click selects)
 *   - "controlled"   → host owns `editing`; this renders ONLY the input while
 *                      editing (ItemRow renders its own masked display span)
 *
 * Used internally by ItemRow and directly by header/title surfaces.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditableLabelProps } from "./types";

export function EditableLabel({
  value,
  onCommit,
  commitMode = "optimistic",
  validate,
  emptyFallback,
  maxLength = 120,
  activation = "click",
  editing: editingProp,
  onEditingChange,
  selectOnEdit = true,
  placeholder,
  ariaLabel = "Name",
  truncate = true,
  className,
  displayClassName,
  inputClassName,
}: EditableLabelProps) {
  const controlled = activation === "controlled";
  const [internalEditing, setInternalEditing] = useState(false);
  const editing = controlled ? !!editingProp : internalEditing;

  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Stay in sync with upstream changes (realtime / auto-label) while idle.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Focus + select on entering edit mode.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (selectOnEdit) inputRef.current.select();
    }
  }, [editing, selectOnEdit]);

  const setEditing = useCallback(
    (next: boolean) => {
      if (controlled) onEditingChange?.(next);
      else setInternalEditing(next);
    },
    [controlled, onEditingChange],
  );

  const startEdit = useCallback(() => {
    setDraft(value);
    setError(null);
    setEditing(true);
  }, [value, setEditing]);

  const cancel = useCallback(() => {
    setDraft(value);
    setError(null);
    setBusy(false);
    setEditing(false);
  }, [value, setEditing]);

  const commit = useCallback(() => {
    if (busy) return;
    const trimmed = draft.trim();
    const next = trimmed || emptyFallback;

    // Empty + no fallback → cancel rather than commit garbage.
    if (next === undefined) {
      cancel();
      return;
    }

    const validationError = validate?.(next) ?? null;
    if (validationError) {
      setError(validationError);
      return;
    }

    // No-op commit — skip the side effect entirely.
    if (next === value) {
      setEditing(false);
      setError(null);
      return;
    }

    if (commitMode === "await") {
      const result = onCommit(next);
      if (result instanceof Promise) {
        setBusy(true);
        result
          .then(() => {
            setBusy(false);
            setEditing(false);
          })
          .catch(() => {
            // Keep edit mode open so the user can retry.
            setBusy(false);
          });
        return;
      }
      setEditing(false);
      return;
    }

    // optimistic — exit immediately, fire-and-forget.
    setEditing(false);
    setError(null);
    const result = onCommit(next);
    if (result instanceof Promise) result.catch(() => {});
  }, [
    busy,
    draft,
    emptyFallback,
    validate,
    value,
    commitMode,
    onCommit,
    cancel,
    setEditing,
  ]);

  if (editing) {
    return (
      <span className={cn("relative flex min-w-0 flex-1 items-center", className)}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          disabled={busy}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            // Contain editing keystrokes so host rows / global hotkeys stay quiet.
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              cancel();
            } else if (e.key === " ") {
              e.stopPropagation();
            }
          }}
          maxLength={maxLength}
          aria-label={ariaLabel}
          aria-invalid={error ? true : undefined}
          // 16px on mobile prevents iOS focus-zoom; sm on desktop.
          className={cn(
            "w-full min-w-0 rounded-sm bg-transparent px-1 outline-none",
            "text-base md:text-sm",
            "focus:bg-background focus:ring-1 focus:ring-ring",
            busy && "opacity-60",
            inputClassName,
          )}
        />
        {busy && (
          <Loader2 className="absolute right-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        {error && (
          <span className="absolute left-0 top-full mt-0.5 whitespace-nowrap text-xs text-destructive">
            {error}
          </span>
        )}
      </span>
    );
  }

  // Controlled mode: host owns the display; render nothing while idle.
  if (controlled) return null;

  return (
    <button
      type="button"
      onClick={
        activation === "click"
          ? (e) => {
              e.stopPropagation();
              startEdit();
            }
          : undefined
      }
      onDoubleClick={
        activation === "doubleClick"
          ? (e) => {
              e.stopPropagation();
              startEdit();
            }
          : undefined
      }
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          startEdit();
        }
      }}
      title={activation === "doubleClick" ? "Double-click to rename" : "Click to rename"}
      aria-label={`Rename ${ariaLabel.toLowerCase()}: ${value}`}
      className={cn(
        "min-w-0 max-w-full rounded-sm px-1 text-left transition-colors",
        "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        truncate && "block truncate",
        className,
        displayClassName,
      )}
    >
      {value || placeholder || ""}
    </button>
  );
}
