"use client";

// lib/entity-list/columns.tsx
//
// Generic column vocabulary for a canonical entity-list surface.
//
// APP POLICY: every column sorts AND filters, server-side, over the WHOLE
// result set. Where a column has a finite value set the filter offers real
// OPTIONS with counts from the facets RPC — not a bare text box. Sorting is on
// the DATABASE column, never the rendered cell.
//
// A feature declares its columns ONCE as `EntityColumnSpec<TRow>[]`; the shell
// derives the table columns, the column picker, the panel's sort options, and
// the default hidden set from that one registry.

import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";

/**
 * A date column's finite value set is "how recently", not "which exact
 * timestamp" — Updated / Created filter by relative bucket, served by
 * `<feature>_since_bucket` in SQL. No column is exempt from filtering.
 */
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
  column: MatrxColumnDef<TRow>;
}

/** Column ids hidden by default — the initial `hiddenColumns` for a new user. */
export function defaultHiddenColumns<TRow>(
  specs: EntityColumnSpec<TRow>[],
): string[] {
  return specs.filter((c) => c.defaultHidden).map((c) => c.id);
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function timeCell(iso: string | null) {
  if (!iso) return <Muted>—</Muted>;
  return (
    <span
      className="tabular-nums text-muted-foreground"
      title={new Date(iso).toLocaleString()}
    >
      {relativeTime(iso)}
    </span>
  );
}
