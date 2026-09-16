"use client";

// lib/entity-list/columns.tsx
//
// Generic column vocabulary for a canonical entity-list surface.
//
// APP POLICY: every capability a column declares runs server-side over the
// WHOLE result set. Sort/filter default on, but an explicit `false` is honest
// when the canonical server path cannot serve it yet. Where a column has a
// finite value set the filter offers real OPTIONS with counts from the facets
// RPC — not a bare text box. Sorting is on the DATABASE column, never the
// rendered cell.
//
// A feature declares its columns ONCE as `EntityColumnSpec<TRow>[]`; the shell
// derives the table columns, the column picker, the panel's sort options, and
// the default hidden set from that one registry.

import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { formatRelativeTime } from "@ai-matrx/kit/format";

/**
 * A date column's finite value set is "how recently", not "which exact
 * timestamp" — Updated / Created filter by relative bucket, served by
 * `<feature>_since_bucket` in SQL. No column is exempt from filtering.
 */
export const DATE_SORT_WORDS = {
  asc: "oldest first",
  desc: "newest first",
} as const;

export const DATE_FILTER_OPTIONS = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "1y", label: "Last year" },
];

export interface EntityColumnSpec<TRow> {
  id: string;
  label: string;
  /** Off until the user turns it on. */
  defaultHidden?: boolean;
  /** Only meaningful outside the "mine" scope (owner/org/access). */
  scopedToShared?: boolean;
  /** Never hideable — the row needs something to identify it by. */
  locked?: boolean;
  /** Facet kind that supplies this column's filter options, when finite. */
  facet?: string;
  /**
   * What ascending and descending MEAN for this column, in the reader's words.
   * The sort menu defaults to "A→Z"/"Z→A", which is nonsense on a date or a
   * count — the Encore shelf offered "Updated (Z→A)" for "newest first"
   * (jobs-bar-2026-09-16, item 8). A column whose filter options are
   * `DATE_FILTER_OPTIONS` gets the date words automatically; anything else
   * that is not alphabetical says so here.
   */
  sortWords?: { asc: string; desc: string };
  /**
   * Human label for one raw facet VALUE, when the stored value is not what a
   * person should read. `conversation_type='subagent'` filters correctly and
   * means nothing to our user; "Subagent run" means something. The count is
   * still appended by the shell, so this never costs the option its number.
   */
  formatFacetValue?: (value: string) => string;
  column: MatrxColumnDef<TRow>;
}

/** Default-on capability without erasing an explicit server-side refusal. */
export function entityColumnSortable<TRow>(
  spec: EntityColumnSpec<TRow>,
): boolean {
  return spec.column.sortable !== false;
}

/** Column ids hidden by default — the initial `hiddenColumns` for a new user. */
export function defaultHiddenColumns<TRow>(
  specs: EntityColumnSpec<TRow>[],
): string[] {
  return specs.filter((c) => c.defaultHidden).map((c) => c.id);
}

// `relativeTime` is gone (2026-09-12): "5m ago" is `formatRelativeTime` from
// `@ai-matrx/kit/format`, and this wrapper passed its argument straight through
// under a second name. Every entity list imports the export's own name now.

export function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

/**
 * A text cell that STAYS INSIDE ITS COLUMN.
 *
 * `truncate` is `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`,
 * and none of the three do anything to an inline `<span>` — so every list cell
 * written as `<span className="truncate">{row.name}</span>` overflowed its
 * column and printed straight over the next one. On 2026-09-16 the Encore
 * shelf rendered "Gio Valiante Performance Coach Masterwork" on top of the
 * Expert column's "Gio Valiante Performance Coach", two strings sharing the
 * same pixels. `block` is what makes the three properties apply.
 *
 * The full value is always reachable: it rides in `title`.
 */
export function TextCell({
  value,
  className,
  muted = false,
}: {
  value: string | null | undefined;
  className?: string;
  muted?: boolean;
}) {
  const text = value?.trim();
  if (!text) return <Muted>—</Muted>;
  return (
    <span
      title={text}
      className={[
        "block truncate",
        muted ? "text-muted-foreground" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {text}
    </span>
  );
}

export function timeCell(iso: string | null) {
  if (!iso) return <Muted>—</Muted>;
  return (
    <span
      className="tabular-nums text-muted-foreground"
      title={new Date(iso).toLocaleString()}
    >
      {formatRelativeTime(iso)}
    </span>
  );
}
