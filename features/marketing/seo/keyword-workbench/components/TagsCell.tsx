"use client";

/**
 * THE TAGS COLUMN's cell — every tag on the keyword as a chip. A chip click
 * filters the list to that tag (or takes it back out); the pencil opens the tag
 * panel for this one keyword.
 */

import { Pencil } from "lucide-react";

import { cn } from "@/styles/themes/utils";
import type { KeywordStamp } from "../data";

/** Chips shown before the rest collapse into "+N". */
export const TAG_CELL_VISIBLE = 3;

export function TagsCell({
  tags,
  activeValues = [],
  onFilter,
  onEdit,
  disabled = false,
}: {
  tags: KeywordStamp[];
  /** Tag value keys the list is filtered on — their chips read as on. */
  activeValues?: string[];
  onFilter?: (value: string) => void;
  onEdit?: () => void;
  disabled?: boolean;
}) {
  const shown = tags.slice(0, TAG_CELL_VISIBLE);
  const hidden = tags.slice(TAG_CELL_VISIBLE);
  return (
    <span
      className="group flex min-w-0 flex-wrap items-center gap-1"
      onClick={(event) => event.stopPropagation()}
    >
      {shown.map((tag) => (
        <button
          key={tag.valueId}
          type="button"
          disabled={disabled || !onFilter}
          title={tag.valueLabel}
          aria-pressed={activeValues.includes(tag.value)}
          onClick={() => onFilter?.(tag.value)}
          className={cn(
            "max-w-28 truncate rounded-full border px-1.5 py-0.5 text-[11px] leading-none",
            activeValues.includes(tag.value)
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-card text-foreground hover:bg-accent",
          )}
        >
          {tag.valueLabel}
        </button>
      ))}
      {hidden.length > 0 ? (
        <span
          className="text-[11px] text-muted-foreground"
          title={hidden.map((tag) => tag.valueLabel).join(", ")}
        >
          +{hidden.length}
        </span>
      ) : null}
      {tags.length === 0 ? (
        <span className="text-[11px] text-muted-foreground">—</span>
      ) : null}
      {onEdit && !disabled ? (
        <button
          type="button"
          aria-label="Edit tags"
          onClick={onEdit}
          className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-100"
        >
          <Pencil className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}
