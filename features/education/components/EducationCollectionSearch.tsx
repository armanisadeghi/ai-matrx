"use client";

import { SearchX } from "lucide-react";
import { SearchInput } from "@/components/official/SearchInput";
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

export function EducationCollectionSearch({
  value,
  onValueChange,
  label,
}: {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
}) {
  return (
    <SearchInput
      value={value}
      onValueChange={onValueChange}
      placeholder={`Search ${label}`}
      aria-label={`Search ${label}`}
      className="w-full sm:w-64"
    />
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
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear search
      </Button>
    </div>
  );
}
