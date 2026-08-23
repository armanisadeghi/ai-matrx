"use client";

/**
 * KeywordChip + TagList — chips that WRAP, never truncate.
 *
 * A keyword / tag / phrase is always shown in full: the chip wraps its text
 * onto extra lines inside the chip, and the list wraps chips onto extra rows.
 * Optional select (checkbox-like toggle), remove (X) and inline edit
 * (pencil → input, Enter commits, Esc cancels). `TagList` adds an inline
 * "Add" input at the end when `onAdd` is given. Contract:
 * `components/kind-kit/README.md`.
 */

import * as React from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KeywordChipProps {
  /** The phrase. Rendered in full — wraps, never truncates. */
  label: string;
  /** Small trailing detail (a count, a volume, a score). */
  meta?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** Selected state; pass `onSelect` to make the chip a toggle. */
  selected?: boolean;
  /** Makes the chip a toggle; called with the next selected state. */
  onSelect?: (selected: boolean) => void;
  /** Adds an X control. */
  onRemove?: () => void;
  /** Enables inline edit (pencil control + double-click); called with the committed text. */
  onEdit?: (next: string) => void;
  /** Greys the chip and disables select/remove/edit. */
  disabled?: boolean;
  tone?: "default" | "primary" | "muted";
  size?: "sm" | "md";
  className?: string;
}

const TONE = {
  default: "border-border bg-background text-foreground",
  primary: "border-primary/40 bg-primary/5 text-foreground",
  muted: "border-border bg-muted text-muted-foreground",
} as const;

export function KeywordChip({
  label,
  meta,
  icon: Icon,
  selected = false,
  onSelect,
  onRemove,
  onEdit,
  disabled = false,
  tone = "default",
  size = "sm",
  className,
}: KeywordChipProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(label);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const selectable = !!onSelect && !disabled;
  const editable = !!onEdit && !disabled;

  const startEdit = () => {
    if (!editable) return;
    setDraft(label);
    setEditing(true);
    // Focus after the input mounts.
    requestAnimationFrame(() => inputRef.current?.select());
  };
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== label) onEdit?.(next);
  };
  const cancel = () => {
    setEditing(false);
    setDraft(label);
  };

  const pad = size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs";
  // Inputs stay >=16px on phones (no iOS zoom), shrink to the chip size on sm+.
  const inputText = size === "md" ? "text-[16px] sm:text-sm" : "text-[16px] sm:text-xs";
  const ctl = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <span
      className={cn(
        // max-w-full + min-w-0 + break-words: the text wraps INSIDE the chip.
        "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border leading-snug",
        pad,
        selected ? "border-primary bg-primary/10 text-foreground" : TONE[tone],
        disabled && "opacity-60",
        className,
      )}
    >
      {selectable && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`${selected ? "Deselect" : "Select"} ${label}`}
          onClick={() => onSelect?.(!selected)}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-sm border",
            size === "md" ? "h-4 w-4" : "h-3.5 w-3.5",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/50 bg-background",
          )}
        >
          {selected && <Check className="h-2.5 w-2.5" />}
        </button>
      )}
      {Icon && <Icon className={cn("shrink-0 text-muted-foreground", ctl)} />}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          aria-label={`Edit ${label}`}
          size={Math.max(4, draft.length + 1)}
          className={cn("min-w-0 bg-transparent outline-none", inputText)}
        />
      ) : (
        <span
          className="min-w-0 whitespace-normal break-words text-left"
          onDoubleClick={startEdit}
        >
          {label}
        </span>
      )}
      {meta !== undefined && meta !== null && (
        <span className="shrink-0 tabular-nums text-muted-foreground">{meta}</span>
      )}
      {editable && !editing && (
        <button
          type="button"
          aria-label={`Edit ${label}`}
          onClick={startEdit}
          className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        >
          <Pencil className={cn("h-3 w-3", size === "md" && "h-3.5 w-3.5")} />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          disabled={disabled}
          onClick={onRemove}
          className="-mr-0.5 shrink-0 rounded-full text-muted-foreground hover:text-destructive disabled:pointer-events-none"
        >
          <X className={ctl} />
        </button>
      )}
    </span>
  );
}

export interface TagItem {
  label: string;
  /** Stable key; defaults to `label`. */
  key?: string;
  meta?: React.ReactNode;
  disabled?: boolean;
}

export interface TagListProps {
  /** Phrases, as strings or `{ label, key?, meta?, disabled? }` objects. */
  items: readonly (string | TagItem)[];
  /** Selected keys (label when no key). Pass with `onToggle` for selectable chips. */
  selected?: readonly string[];
  /** Makes chips toggles; called with (key, nextSelected). */
  onToggle?: (key: string, selected: boolean) => void;
  /** Adds an X on every chip; called with (key, index). */
  onRemove?: (key: string, index: number) => void;
  /** Enables inline edit on every chip; called with (key, index, nextLabel). */
  onEdit?: (key: string, index: number, next: string) => void;
  /** Renders an inline "Add" input at the end; called with the trimmed text. */
  onAdd?: (label: string) => void;
  /** Placeholder of the add input. Default "Add…". */
  addPlaceholder?: string;
  /** Shown when `items` is empty (and there is no add input). */
  emptyState?: React.ReactNode;
  tone?: KeywordChipProps["tone"];
  size?: KeywordChipProps["size"];
  disabled?: boolean;
  className?: string;
}

function normalize(item: string | TagItem): TagItem {
  return typeof item === "string" ? { label: item } : item;
}

export function TagList({
  items,
  selected,
  onToggle,
  onRemove,
  onEdit,
  onAdd,
  addPlaceholder = "Add…",
  emptyState,
  tone,
  size = "sm",
  disabled = false,
  className,
}: TagListProps) {
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const inputText = size === "md" ? "text-[16px] sm:text-sm" : "text-[16px] sm:text-xs";
  const selectedSet = new Set(selected ?? []);

  const commitAdd = () => {
    const next = draft.trim();
    if (next) onAdd?.(next);
    setDraft("");
    setAdding(false);
  };

  if (items.length === 0 && !onAdd) {
    return emptyState !== undefined ? (
      <div className={cn("text-xs text-muted-foreground", className)}>
        {emptyState}
      </div>
    ) : null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {items.map((raw, index) => {
        const item = normalize(raw);
        const key = item.key ?? item.label;
        return (
          <KeywordChip
            key={`${key}-${index}`}
            label={item.label}
            meta={item.meta}
            tone={tone}
            size={size}
            disabled={disabled || item.disabled}
            selected={selectedSet.has(key)}
            onSelect={onToggle ? (next) => onToggle(key, next) : undefined}
            onRemove={onRemove ? () => onRemove(key, index) : undefined}
            onEdit={onEdit ? (next) => onEdit(key, index, next) : undefined}
          />
        );
      })}
      {items.length === 0 && emptyState !== undefined && (
        <span className="text-xs text-muted-foreground">{emptyState}</span>
      )}
      {onAdd && !disabled && (
        adding ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-dashed border-primary/60 bg-background",
              size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs",
            )}
          >
            <input
              autoFocus
              value={draft}
              placeholder={addPlaceholder}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitAdd}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitAdd();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setDraft("");
                  setAdding(false);
                }
              }}
              aria-label={addPlaceholder}
              size={Math.max(6, draft.length + 1)}
              className={cn("min-w-0 bg-transparent outline-none placeholder:text-muted-foreground", inputText)}
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/60 hover:text-foreground",
              size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs",
            )}
          >
            <Plus className="h-3 w-3" />
            {addPlaceholder.replace(/…$/, "")}
          </button>
        )
      )}
    </div>
  );
}
