"use client";

// lib/entity-list/usageColumns.tsx
//
// THE usage columns — Runs, Last used, Success rate, Failures, Cost — declared
// ONCE for every list whose rows carry a usage rollup. Agents (`agx_list_scoped`)
// and workflows (`wfx_list_scoped`) both read `platform.entity_usage`, so the
// two lists show the same five columns with the same words, widths, sorts and
// filters; neither declares its own copy.
//
// Column ids ARE the list RPC's sort/filter keys (the shell sends the column id
// as `p_sort` and as the key in `p_filters`). Workflows already named their
// last-run sort `last_run`, so the caller names that one id; everything else is
// the same key on both RPCs.
//
// Sort is served server-side for all five. Filter is served for Runs (count
// buckets; '0' = never used) and Last used (the since buckets). Success rate,
// Failures and Cost have no server filter yet, so they declare `filter: false`
// honestly rather than offering a control that would filter only the page.
//
// Warnings is the sixth column, offered only by an entity whose rollup counts
// warnings (workflows: "Check and Revise" misses written to workflow.run_log,
// counted since the workflow's last edit, so fixing a step clears it). Sort and
// filter (the Runs buckets; '0' = none) are both served by the RPC.

import type { ReactNode } from "react";
import Link from "next/link";
import { formatPercentFromFraction, safeRatio } from "@ai-matrx/kit/format";
import { Cost } from "@/components/cost/Cost";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  timeCell,
  type EntityColumnSpec,
} from "./columns";

/** What one row says about its own use. Counts are whole numbers; cost is USD. */
export interface UsageReading {
  runs: number;
  successes: number;
  failures: number;
  lastUsedAt: string | null;
  costUsd: number | null;
}

/** Runs buckets — the SQL half is `wfx_bucket_matches`; '0' is "never used". */
export const USAGE_RUNS_FILTER_OPTIONS = [
  { value: "0", label: "Never used" },
  { value: "1-5", label: "1–5" },
  { value: "6-20", label: "6–20" },
  { value: "gt20", label: "More than 20" },
];

/** Warnings buckets — the same SQL half (`wfx_bucket_matches`); '0' is "none". */
export const USAGE_WARNINGS_FILTER_OPTIONS = [
  { value: "0", label: "None" },
  ...USAGE_RUNS_FILTER_OPTIONS.slice(1),
];

/** A link a usage cell opens (the door law: a count that has a page opens it). */
export interface UsageDoor {
  href: string;
  title: string;
}

export interface UsageColumnOptions<TRow> {
  /** Reads the rollup off one row — the only per-entity knowledge needed. */
  read: (row: TRow) => UsageReading;
  /** The RPC's sort/filter key for "last used": `last_used` (agents) or `last_run` (workflows). */
  lastUsedId: string;
  /** Where the run count opens, when the entity has a run-history page. */
  runsDoor?: (row: TRow) => UsageDoor | null;
  /** Where the last-used time opens, when the last run is a record. */
  lastUsedDoor?: (row: TRow) => UsageDoor | null;
  /**
   * The Warnings column, for an entity whose rollup counts warnings since its
   * last edit (RPC sort/filter key `warnings`). Absent = no column.
   */
  warnings?: {
    read: (row: TRow) => number;
    door?: (row: TRow) => UsageDoor | null;
  };
}

/** Facet value '0' is a bucket id; the panel reads words. */
export function formatRunsFacet(value: string): string {
  return (
    USAGE_RUNS_FILTER_OPTIONS.find((o) => o.value === value)?.label ?? value
  );
}

export function formatWarningsFacet(value: string): string {
  return (
    USAGE_WARNINGS_FILTER_OPTIONS.find((o) => o.value === value)?.label ??
    value
  );
}

function DoorLink({ door, children }: { door: UsageDoor; children: ReactNode }) {
  return (
    <Link
      href={door.href}
      onClick={(e) => e.stopPropagation()}
      className="tabular-nums text-muted-foreground hover:text-foreground hover:underline"
      title={door.title}
    >
      {children}
    </Link>
  );
}

function warningsColumn<TRow>(
  warnings: NonNullable<UsageColumnOptions<TRow>["warnings"]>,
): EntityColumnSpec<TRow> {
  return {
    id: "warnings",
    label: "Warnings",
    facet: "warnings",
    formatFacetValue: formatWarningsFacet,
    sortWords: { asc: "fewest first", desc: "most first" },
    column: {
      id: "warnings",
      accessorFn: (row) => warnings.read(row),
      header: "Warnings",
      filter: "select",
      filterOptions: USAGE_WARNINGS_FILTER_OPTIONS,
      width: 90,
      align: "right",
      cell: (row) => {
        const n = warnings.read(row);
        if (n <= 0) return <Muted>—</Muted>;
        const door = warnings.door?.(row);
        const title = `${n} check ${n === 1 ? "warning" : "warnings"} since the last edit`;
        if (door) {
          return (
            <Link
              href={door.href}
              onClick={(e) => e.stopPropagation()}
              className="tabular-nums text-warning hover:underline"
              title={door.title}
            >
              {n}
            </Link>
          );
        }
        return (
          <span className="tabular-nums text-warning" title={title}>
            {n}
          </span>
        );
      },
    },
  };
}

/**
 * The usage columns, in display order. Failures starts hidden; Warnings
 * follows Failures when the entity counts them.
 */
export function usageColumns<TRow>(
  options: UsageColumnOptions<TRow>,
): EntityColumnSpec<TRow>[] {
  const { read, lastUsedId, runsDoor, lastUsedDoor, warnings } = options;
  return [
    {
      id: "runs",
      label: "Runs",
      facet: "runs",
      formatFacetValue: formatRunsFacet,
      sortWords: { asc: "fewest first", desc: "most first" },
      column: {
        id: "runs",
        accessorFn: (row) => read(row).runs,
        header: "Runs",
        filter: "select",
        filterOptions: USAGE_RUNS_FILTER_OPTIONS,
        width: 80,
        align: "right",
        cell: (row) => {
          const n = read(row).runs;
          if (n <= 0) return <Muted>Never</Muted>;
          const door = runsDoor?.(row);
          if (door) return <DoorLink door={door}>{n}</DoorLink>;
          return <span className="tabular-nums text-muted-foreground">{n}</span>;
        },
      },
    },
    {
      id: lastUsedId,
      label: "Last used",
      column: {
        id: lastUsedId,
        accessorFn: (row) => read(row).lastUsedAt,
        header: "Last used",
        filter: "select",
        filterOptions: DATE_FILTER_OPTIONS,
        width: 120,
        align: "right",
        cell: (row) => {
          const at = read(row).lastUsedAt;
          const door = at ? lastUsedDoor?.(row) : null;
          if (!at || !door) return timeCell(at);
          return <DoorLink door={door}>{timeCell(at)}</DoorLink>;
        },
      },
    },
    {
      id: "success_rate",
      label: "Success rate",
      sortWords: { asc: "lowest first", desc: "highest first" },
      column: {
        id: "success_rate",
        accessorFn: (row) => {
          const u = read(row);
          return safeRatio(u.successes, u.successes + u.failures);
        },
        header: "Success",
        // No server filter for a ratio yet; sort is served.
        filter: false,
        width: 90,
        align: "right",
        cell: (row) => {
          const u = read(row);
          const settled = u.successes + u.failures;
          if (settled === 0) return <Muted>—</Muted>;
          return (
            <span
              className="tabular-nums text-muted-foreground"
              title={`${u.successes} of ${settled} finished runs succeeded`}
            >
              {formatPercentFromFraction(safeRatio(u.successes, settled))}
            </span>
          );
        },
      },
    },
    {
      id: "failures",
      label: "Failures",
      defaultHidden: true,
      sortWords: { asc: "fewest first", desc: "most first" },
      column: {
        id: "failures",
        accessorFn: (row) => read(row).failures,
        header: "Failures",
        filter: false,
        width: 80,
        align: "right",
        cell: (row) => {
          const n = read(row).failures;
          return n > 0 ? (
            <span className="tabular-nums text-muted-foreground">{n}</span>
          ) : (
            <Muted>—</Muted>
          );
        },
      },
    },
    ...(warnings ? [warningsColumn(warnings)] : []),
    {
      id: "cost",
      label: "Cost",
      sortWords: { asc: "cheapest first", desc: "costliest first" },
      column: {
        id: "cost",
        accessorFn: (row) => read(row).costUsd,
        header: "Cost",
        filter: false,
        width: 100,
        align: "right",
        cell: (row) => {
          const u = read(row);
          // Never used is not "0 points" — it is nothing to measure.
          if (u.runs <= 0) return <Muted>—</Muted>;
          return <Cost usd={u.costUsd} short className="text-muted-foreground" />;
        },
      },
    },
  ];
}
