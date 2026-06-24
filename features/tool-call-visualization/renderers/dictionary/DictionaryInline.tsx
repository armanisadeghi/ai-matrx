"use client";

import { useMemo } from "react";
import { BookText } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { parseDictionary } from "./parseDictionary";
import { DictEntryList } from "./DictEntryList";

/**
 * Inline renderer for the `dictionary` tool — the terminology/pronunciation
 * entries (the result payload) rendered as a clean list. "View all" opens the
 * overlay with the full set.
 */
const MAX_INLINE = 8;

export function DictionaryInline({
  entry,
  onOpenOverlay,
  toolGroupId = "default",
}: ToolRendererProps) {
  const { entries, level } = useMemo(() => parseDictionary(entry), [entry]);
  if (!entries.length) return null;

  const shown = entries.slice(0, MAX_INLINE);
  const hasMore = entries.length > shown.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/90">
        <BookText className="h-4 w-4 text-primary" />
        <span>
          {entries.length} {entries.length === 1 ? "term" : "terms"}
        </span>
        {level ? (
          <span className="text-xs capitalize text-muted-foreground">
            · {level.replace(/_/g, " ")} dictionary
          </span>
        ) : null}
      </div>

      <DictEntryList entries={shown} />

      {hasMore && onOpenOverlay ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenOverlay(`tool-group-${toolGroupId}`);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted/40 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <BookText className="h-4 w-4" />
          View all {entries.length} terms
        </button>
      ) : null}
    </div>
  );
}
