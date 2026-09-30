"use client";

/**
 * features/knowledge/hub/transcripts/transcriptTableColumns.tsx — the hub's
 * Transcripts table carries the Transcripts module's OWN columns
 * (`features/transcripts/browse/columns.tsx`, the one registry), not a second
 * hand-made set. Each module column is lifted onto a hub row by reading the
 * transcript list row behind it (`rowFor`), so its cell, its value and its
 * sort are the module's, unchanged.
 *
 * Two hub-side rules on top:
 *   • a column no loaded row has a value for is absent (never a column of dashes);
 *   • the module's bucket filters ("Under a minute", "Last 7 days") are served by
 *     its server functions; the hub table filters the rows in hand, so those
 *     columns filter by their value (a number range, a date) instead.
 */

import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { DATE_FILTER_OPTIONS, Muted, type EntityColumnSpec } from "@/lib/entity-list/columns";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import { TRANSCRIPT_COLUMNS } from "@/features/transcripts/browse/columns";
import type { TranscriptListRow } from "@/features/transcripts/browse/types";

type FilterKind = NonNullable<MatrxColumnDef<KnowledgeHit>["filter"]>;

function isEmpty(value: unknown): boolean {
  if (value == null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Filter kind for a hub table: the module's, except bucket filters its server serves. */
function hubFilterFor(spec: EntityColumnSpec<TranscriptListRow>): FilterKind {
  const col = spec.column;
  if (col.filterOptions === DATE_FILTER_OPTIONS) return "date";
  if (col.filterOptions) return "auto";
  return col.filter ?? "auto";
}

export function transcriptHubColumns(
  rowFor: (hit: KnowledgeHit) => TranscriptListRow | undefined,
  hits: KnowledgeHit[],
): MatrxColumnDef<KnowledgeHit>[] {
  const out: MatrxColumnDef<KnowledgeHit>[] = [];
  for (const spec of TRANSCRIPT_COLUMNS) {
    // The hub's own Name column carries the title (its menu, rename, peek); the module's
    // off-by-default columns stay off here too.
    if (spec.id === "title" || spec.defaultHidden) continue;
    const col = spec.column;
    const valueOf = (hit: KnowledgeHit): unknown => {
      const row = rowFor(hit);
      if (!row) return undefined;
      if (col.accessorFn) return col.accessorFn(row);
      return col.accessorKey ? row[col.accessorKey] : undefined;
    };
    // `duration_seconds` 0 means "unknown length" in the module (formatDuration prints a dash).
    const has = (hit: KnowledgeHit) => {
      const v = valueOf(hit);
      return spec.id === "duration" ? typeof v === "number" && v > 0 : !isEmpty(v);
    };
    if (spec.id !== "kind" && hits.length > 0 && !hits.some(has)) continue;
    const sortValue = col.sortValue;
    out.push({
      id: spec.id,
      header: col.header,
      label: spec.label,
      width: col.width,
      minWidth: col.minWidth,
      align: col.align,
      className: col.className,
      filter: hubFilterFor(spec),
      accessorFn: valueOf,
      ...(sortValue
        ? {
            sortValue: (hit: KnowledgeHit) => {
              const row = rowFor(hit);
              return row ? sortValue(row) : undefined;
            },
          }
        : {}),
      ...(spec.id === "updated" ? { defaultSortDirection: "desc" as const } : {}),
      cell: (hit: KnowledgeHit, index: number) => {
        const row = rowFor(hit);
        if (!row || !col.cell) return <Muted>—</Muted>;
        return col.cell(row, index);
      },
    });
  }
  return out;
}
