"use client";

// features/acquisition-console/columns.tsx
//
// THE THREE COLUMN SETS. One rule runs through all of them: every row ends in a
// column that says what to DO, and that column is never empty. "Nothing to do"
// is an answer; a blank in an action column reads as a control that failed to
// render (root CLAUDE.md: a screen is absent or honest, never dead-looking).
//
// Values that are independently meaningful get their own column and never share
// a cell, so each can be sorted and filtered on its own
// (`.claude/skills/canonical-table-usage/SKILL.md` rules 1 and 2).

import Link from "next/link";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { Badge } from "@/components/ui/badge";
import { Muted, TextCell, timeCell } from "@/lib/entity-list/columns";
import {
  CONNECTION_STATUS_LABELS,
  PROVIDER_LABELS,
  labelFor,
  type BlockedRow,
  type ConnectedRow,
  type HaveRow,
} from "./types";

const STATUS_ACCENT: Record<string, string> = {
  connected:
    "border-emerald-500/40 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300",
  needs_attention:
    "border-amber-500/40 text-amber-700 dark:border-amber-400/40 dark:text-amber-300",
  expired:
    "border-amber-500/40 text-amber-700 dark:border-amber-400/40 dark:text-amber-300",
  revoked:
    "border-rose-500/40 text-rose-700 dark:border-rose-400/40 dark:text-rose-300",
  error:
    "border-rose-500/40 text-rose-700 dark:border-rose-400/40 dark:text-rose-300",
  pending:
    "border-sky-500/40 text-sky-700 dark:border-sky-400/40 dark:text-sky-300",
};

/** A number a person can read at a glance, or an honest dash. */
function countCell(value: number | null) {
  if (value === null) return <Muted>—</Muted>;
  return <span className="tabular-nums">{value.toLocaleString()}</span>;
}

/** The action column's one link, spelled the same way in all three tables. */
function actionCell(label: string, href: string, muted = false) {
  if (muted) {
    return <span className="text-muted-foreground">{label}</span>;
  }
  return (
    <Link
      href={href}
      className="underline-offset-2 hover:underline"
      title={label}
    >
      {label}
    </Link>
  );
}

export const HAVE_COLUMNS: MatrxColumnDef<HaveRow>[] = [
  {
    id: "kind",
    accessorKey: "kind",
    header: "What we have",
    label: "What we have",
    filter: "text",
    href: (row) => row.href,
    cell: (row) => <TextCell value={row.kind} className="font-medium" />,
  },
  {
    id: "lane",
    accessorKey: "lane",
    header: "Who can see it",
    label: "Who can see it",
    filter: "select",
    cell: (row) => <TextCell value={row.lane} muted />,
  },
  {
    id: "count",
    accessorKey: "count",
    header: "How many",
    label: "How many",
    defaultSortDirection: "desc",
    cell: (row) => countCell(row.count),
  },
  {
    id: "items",
    accessorKey: "items",
    header: "Things inside",
    label: "Things inside",
    defaultSortDirection: "desc",
    cell: (row) => countCell(row.items),
  },
  {
    id: "lastAdded",
    accessorKey: "lastAdded",
    header: "Last added",
    label: "Last added",
    defaultSortDirection: "desc",
    cell: (row) => timeCell(row.lastAdded),
  },
  {
    id: "yield",
    // Sorting reads the NUMBER, the cell prints the SENTENCE. A "Not reported
    // yet" row sorts to the bottom (-1) rather than pretending to be a zero.
    accessorKey: "yield",
    sortValue: (row) => row.yieldCount,
    header: "What it produced",
    label: "What it produced",
    filter: "text",
    cell: (row) => <TextCell value={row.yield} muted={row.yieldCount < 0} />,
  },
];

export const CONNECTED_COLUMNS: MatrxColumnDef<ConnectedRow>[] = [
  {
    id: "provider",
    accessorKey: "provider",
    header: "Account",
    label: "Account",
    filter: "select",
    href: (row) => row.href,
    cell: (row) => (
      <TextCell
        value={labelFor(PROVIDER_LABELS, row.provider)}
        className="font-medium"
      />
    ),
  },
  {
    id: "ownerScope",
    accessorKey: "ownerScope",
    header: "Whose",
    label: "Whose",
    filter: "select",
    filterOptions: [
      { value: "organization", label: "This workspace" },
      { value: "user", label: "Yours" },
    ],
    cell: (row) => (
      <TextCell
        value={row.ownerScope === "organization" ? "This workspace" : "Yours"}
        muted
      />
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: "State",
    label: "State",
    filter: "select",
    cell: (row) => (
      <Badge
        variant="outline"
        className={STATUS_ACCENT[row.status] ?? "text-muted-foreground"}
      >
        {labelFor(CONNECTION_STATUS_LABELS, row.status)}
      </Badge>
    ),
  },
  {
    id: "account",
    accessorKey: "account",
    header: "Signed in as",
    label: "Signed in as",
    filter: "text",
    cell: (row) => <TextCell value={row.account} muted />,
  },
  {
    id: "lastSync",
    accessorKey: "lastSync",
    header: "Last checked",
    label: "Last checked",
    defaultSortDirection: "desc",
    cell: (row) => timeCell(row.lastSync),
  },
  {
    id: "action",
    accessorKey: "action",
    header: "The one action",
    label: "The one action",
    filter: "select",
    cell: (row) =>
      actionCell(row.action, row.href, row.action === "Nothing to do"),
  },
];

export const BLOCKED_COLUMNS: MatrxColumnDef<BlockedRow>[] = [
  {
    id: "what",
    accessorKey: "what",
    header: "What we could not get",
    label: "What we could not get",
    filter: "text",
    href: (row) => row.href,
    cell: (row) => <TextCell value={row.what} className="font-medium" />,
  },
  {
    id: "origin",
    accessorKey: "origin",
    header: "Waiting on",
    label: "Waiting on",
    filter: "select",
    filterOptions: [
      { value: "block", label: "Us" },
      { value: "handoff", label: "You" },
    ],
    cell: (row) => (
      <TextCell value={row.origin === "handoff" ? "You" : "Us"} muted />
    ),
  },
  {
    id: "where",
    accessorKey: "where",
    header: "What happened",
    label: "What happened",
    filter: "text",
    cell: (row) => <TextCell value={row.where} />,
  },
  {
    id: "since",
    accessorKey: "since",
    header: "Since",
    label: "Since",
    defaultSortDirection: "desc",
    cell: (row) => timeCell(row.since),
  },
  {
    id: "times",
    accessorKey: "times",
    header: "Times",
    label: "Times",
    defaultSortDirection: "desc",
    cell: (row) => countCell(row.times),
  },
  {
    id: "action",
    accessorKey: "action",
    header: "The one action",
    label: "The one action",
    filter: "text",
    cell: (row) => actionCell(row.action, row.href),
  },
];
