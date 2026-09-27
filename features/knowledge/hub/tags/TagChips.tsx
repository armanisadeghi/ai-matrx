"use client";

/** `#tag` chips on a row or in the peek. Clicking one filters the hub by it. */

import { cn } from "@/utils/cn";

export function TagChips({
  tags,
  onFilter,
  max = 3,
  className,
}: {
  tags: string[];
  onFilter?: (name: string) => void;
  max?: number;
  className?: string;
}) {
  if (!tags.length) return null;
  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-1", className)} data-testid="tag-chips">
      {shown.map((t) =>
        onFilter ? (
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
