"use client";

/**
 * features/hr/time/overtime/components/OvertimeQueueTable.tsx — ROUTE 31a, `/hr/time/overtime`.
 *
 * SPEC-UI-IA §3.4 row 31a names `MatrxDataTable`, so this is the canonical table.
 *
 * 🚨 THE COLUMN THAT MATTERS MOST IS THE STATE COLUMN, AND `worked-unapproved` RENDERS AS
 * **"Worked without approval — paid, flagged for review"**. Never "unpaid", never "withheld", never
 * "pending", never a zero. Sorting or filtering by state never hides a paid row behind a payment
 * word, because no payment word exists in this vocabulary.
 *
 * NO CLIENT COMPUTES HOURS. `requestedHours`, `approvedHours`, `actualOtHours` and `varianceHours`
 * all arrive computed and snapshot-backed; this file formats them and nothing else.
 */

import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { formatHours, formatLocalDate } from "../../shared/format";
import type { OvertimePreapprovalRow } from "../../api/types";
import {
  OT_STATE_LABEL,
  UNAPPROVED_OT_IS_PAID,
  thresholdAxisLabel,
  type OvertimeQueueState,
} from "../overtimeVocabulary";
import { OvertimeStateChip } from "./OvertimeStateChip";

/**
 * The row's display state. `unapprovedOtFlagged` wins over the stored state because it is the fact
 * a manager needs to see: a row that is `denied` AND was worked anyway is a materially different
 * management situation from one that was simply denied, and §4.6 requires the difference to be
 * visible.
 */
export function displayState(row: OvertimePreapprovalRow): OvertimeQueueState {
  if (row.unapprovedOtFlagged) return "worked-unapproved";
  return row.state;
}

const FILTERABLE_STATES: OvertimeQueueState[] = [
  "requested",
  "approved",
  "denied",
  "worked-unapproved",
  "expired",
  "withdrawn",
  "auto_flagged",
];

export interface OvertimeQueueTableProps {
  rows: OvertimePreapprovalRow[];
  isLoading: boolean;
  hrefFor: (row: OvertimePreapprovalRow) => string;
}

export function OvertimeQueueTable({ rows, isLoading, hrefFor }: OvertimeQueueTableProps) {
  const router = useRouter();

  const columns: MatrxColumnDef<OvertimePreapprovalRow>[] = [
    {
      id: "employeeDisplayName",
      accessorKey: "employeeDisplayName",
      header: "Person",
      href: (row) => hrefFor(row),
      cell: (row) => (
        <span className="font-medium text-foreground">{row.employeeDisplayName}</span>
      ),
      width: 180,
    },
    {
      id: "window",
      accessorFn: (row) => (row as OvertimePreapprovalRow).coversFrom,
      header: "Window",
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatLocalDate(row.coversFrom.slice(0, 10))} – {formatLocalDate(row.coversTo.slice(0, 10))}
        </span>
      ),
      width: 170,
    },
    {
      id: "state",
      accessorFn: (row) => displayState(row as OvertimePreapprovalRow),
      header: "State",
      filter: "select",
      filterOptions: FILTERABLE_STATES.map((s) => ({ value: s, label: OT_STATE_LABEL[s] })),
      cell: (row) => <OvertimeStateChip state={displayState(row)} />,
      width: 260,
    },
    {
      id: "requestedHours",
      accessorKey: "requestedHours",
      header: "Requested",
      align: "right",
      width: 100,
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">{formatHours(row.requestedHours)}</span>
      ),
    },
    {
      id: "approvedHours",
      accessorKey: "approvedHours",
      header: "Cap",
      align: "right",
      width: 90,
      mobileHidden: true,
      cell: (row) =>
        row.approvedHours === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className="tabular-nums text-foreground"
            title="Approved with a cap. Overtime beyond the cap is still paid, and is flagged for review."
          >
            {formatHours(row.approvedHours)}
          </span>
        ),
    },
    {
      id: "actualOtHours",
      accessorKey: "actualOtHours",
      header: "Actually worked",
      align: "right",
      width: 140,
      cell: (row) =>
        row.actualOtHours === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 tabular-nums text-foreground">
            {formatHours(row.actualOtHours)}
            {row.unapprovedOtFlagged ? (
              // 🚨 The flag sits WITH the number, and what it says is "paid".
              <span title={UNAPPROVED_OT_IS_PAID} className="inline-flex">
                <ShieldAlert
                  className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
                  aria-label="Paid, flagged for review"
                />
              </span>
            ) : null}
          </span>
        ),
    },
    {
      id: "thresholdAxes",
      accessorFn: (row) => (row as OvertimePreapprovalRow).thresholdAxes.join(", "),
      header: "Thresholds",
      width: 200,
      mobileHidden: true,
      cell: (row) => (
        <span className="text-[11px] text-muted-foreground">
          {row.thresholdAxes.length === 0
            ? "—"
            : row.thresholdAxes.map(thresholdAxisLabel).join(" · ")}
        </span>
      ),
    },
  ];

  return (
    <MatrxDataTable<OvertimePreapprovalRow>
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      zebra
      searchText={(row) => `${row.employeeDisplayName} ${row.state} ${row.reasonNote ?? ""}`}
      toolbar={{ search: true, searchPlaceholder: "Search overtime requests…" }}
      onRowOpen={(row) => router.push(hrefFor(row))}
      emptyState={{
        title: "No overtime requests",
        description:
          "Requests appear here when someone asks to work overtime in advance, when a manager plans coverage, or when overtime is worked without a request — those last are paid and flagged so a manager can look at them.",
      }}
    />
  );
}
