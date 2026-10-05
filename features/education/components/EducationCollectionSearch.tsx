"use client";

import { Search, SearchX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type SearchTerm = string | null | undefined;

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

/**
 * A generated artifact's `source_title` duplicates its own `title` whenever
 * the source WAS the typed topic ("Agent Test Topic: the water cycle" from
 * "Agent Test Topic: the water cycle") — showing "from <same text>" right
 * next to the title is the same fact twice, not provenance. This also strips
 * a leading markdown heading marker ("# Photosynthesis") a source's raw
 * first line can carry, which otherwise leaks into the UI verbatim. Returns
 * `null` when there is nothing distinct to show.
 */
export function distinctSourceTitle(
  title: string | null | undefined,
  sourceTitle: string | null | undefined,
): string | null {
  if (!sourceTitle) return null;
  const cleaned = sourceTitle.replace(/^#+\s*/, "").trim();
  if (!cleaned) return null;
  if (title && normalized(cleaned) === normalized(title)) return null;
  return cleaned;
}

/** Filters a loaded collection only; callers retain the complete collection for page scope. */
export function filterEducationCollection<TRow>(
  rows: readonly TRow[],
  query: string,
  termsForRow: (row: TRow) => readonly SearchTerm[],
): TRow[] {
  const needle = normalized(query);
  if (!needle) return [...rows];

  return rows.filter((row) =>
    termsForRow(row).some((term) => term?.toLocaleLowerCase().includes(needle)),
  );
}

/**
 * The collection search box — drawn exactly like the list pages' toolbar
 * search (lib/entity-list EntityListToolbar): one bordered card-surface box,
 * icon inside, one clear button. 16px text on touch screens (no iOS zoom).
 */
export function EducationCollectionSearch({
  value,
  onValueChange,
  label,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 focus-within:border-ring sm:w-64 lg:h-9",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={`Search ${label}`}
        aria-label={`Search ${label}`}
        className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground lg:text-sm [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onValueChange("")}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground lg:h-7 lg:w-7"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function EducationCollectionNoResults({
  query,
  label,
  onClear,
}: {
  query: string;
  label: string;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
      <SearchX className="h-7 w-7 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        No {label} match “{query.trim()}”.
      </p>
      <Button variant="quiet" onClick={onClear}>
        Clear search
      </Button>
    </div>
  );
}
