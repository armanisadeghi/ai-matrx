"use client";

/** `#tag` chips on a row or in the peek. Clicking one filters the hub by it. */

import { cn } from "@/utils/cn";

export function TagChips({
  tags,
  onFilter,
  onRemove,
  max = 3,
  className,
}: {
  tags: string[];
  onFilter?: (name: string) => void;
  /** Present: each chip carries an × that takes the tag off this item. */
  onRemove?: (name: string) => void;
  max?: number;
  className?: string;
}) {
  if (!tags.length) return null;
  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-1", className)} data-testid="tag-chips">
      {shown.map((t) =>
        onRemove ? (
          <span key={t} className="inline-flex max-w-48 items-center rounded bg-muted text-[11px] text-muted-foreground">
            <button
              type="button"
              className="min-w-0 truncate rounded-l px-1.5 py-px hover:bg-accent hover:text-foreground"
              title={`Show everything tagged #${t}`}
              onClick={(e) => {
                e.stopPropagation();
                onFilter?.(t);
              }}
            >
              #{t}
            </button>
            <button
              type="button"
              className="rounded-r px-1 py-px hover:bg-destructive/15 hover:text-destructive"
              aria-label={`Remove the tag ${t}`}
              title="Remove tag"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(t);
              }}
            >
              ×
            </button>
          </span>
        ) : onFilter ? (
          <button
            key={t}
            type="button"
            className="max-w-40 truncate rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            title={`Show everything tagged #${t}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onFilter(t);
            }}
          >
            #{t}
          </button>
        ) : (
          <span key={t} className="max-w-40 truncate rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
            #{t}
          </span>
        ),
      )}
      {rest > 0 ? <span className="text-[11px] text-muted-foreground">+{rest}</span> : null}
    </span>
  );
}
