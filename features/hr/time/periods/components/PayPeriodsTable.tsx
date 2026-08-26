"use client";

/**
 * features/hr/time/periods/components/PayPeriodsTable.tsx — ROUTE 32, `/hr/time/periods`.
 *
 * The pay-period state machine per pay group. SPEC-UI-IA §3.4 row 32 names `MatrxDataTable` as the
 * primary component, so this is the canonical table with columns — not a hand-rolled grid.
 *
 * 🚨 TWO STATE MACHINES, LABELLED DISTINCTLY (SPEC-TIME §14 D8). The **State** column is the
 * period's; the **Timecards** column is the row machine's progress and is deliberately worded
 * `"N of M approved"` rather than a bare state, so a reader can never take one for the other.
 * Approving one person never moves the period.
 *
 * NO CLIENT COMPUTES ANYTHING. `counts` arrives from the server. This file sums nothing, subtracts
 * no dates and derives no totals.
 */

import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { formatLocalDate } from "../../shared/format";
import type { PayPeriodRow, PayPeriodState } from "../../api/types";
import { PERIOD_STATE_LABEL, rowProgressSentence } from "../periodStateMachine";
import { StateBadge } from "./StateBadge";

const PERIOD_STATES: PayPeriodState[] = [
  "open",
  "submitted",
  "approved",
  "exported",
  "locked",
  "closed",
  "reopened",
];

export interface PayPeriodsTableProps {
  rows: PayPeriodRow[];
  isLoading: boolean;
  /** Built by `hrTimePeriodHref` — never hand-assembled, so `?org=` always travels. */
  hrefFor: (row: PayPeriodRow) => string;
}

export function PayPeriodsTable({ rows, isLoading, hrefFor }: PayPeriodsTableProps) {
  const router = useRouter();

  const columns: MatrxColumnDef<PayPeriodRow>[] = [
    {
      id: "payGroupName",
      accessorKey: "payGroupName",
      header: "Pay group",
      href: (row) => hrefFor(row),
      cell: (row) => <span className="font-medium text-foreground">{row.payGroupName}</span>,
      width: 200,
    },
    {
      id: "period",
      accessorFn: (row) => (row as PayPeriodRow).periodStartOn,
      header: "Period",
      cell: (row) => (
        <span className="whitespace-nowrap text-foreground">
          {formatLocalDate(row.periodStartOn, { year: true })} –{" "}
          {formatLocalDate(row.periodEndOn, { year: true })}
        </span>
      ),
      width: 210,
    },
    {
      id: "sequenceNumber",
      accessorKey: "sequenceNumber",
      header: "#",
      align: "right",
      width: 60,
      mobileHidden: true,
    },
    {
      id: "state",
      accessorKey: "state",
      header: "Period state",
      filter: "select",
      filterOptions: PERIOD_STATES.map((s) => ({ value: s, label: PERIOD_STATE_LABEL[s] })),
      cell: (row) => <StateBadge machine="period" state={row.state} />,
      width: 130,
    },
    {
      id: "timecards",
      accessorFn: (row) => (row as PayPeriodRow).counts.approved,
      header: "Timecards",
      // The ROW machine's progress. Worded, never a bare state — see this file's header.
      cell: (row) => (
        <span className="text-muted-foreground">{rowProgressSentence(row)}</span>
      ),
      width: 180,
    },
    {
      id: "disputed",
      accessorFn: (row) => (row as PayPeriodRow).counts.disputed,
      header: "Disagreements",
      align: "right",
      width: 130,
      cell: (row) =>
        row.counts.disputed > 0 ? (
          <span
            className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"
            // Approving over a disagreement is legitimate AND recorded. This is not a blocker.
            title="Approving over a preserved disagreement is allowed. The disagreement travels to the export as evidence."
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {row.counts.disputed}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "payDate",
      accessorKey: "payDate",
      header: "Pay date",
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatLocalDate(row.payDate, { year: true })}
        </span>
      ),
      width: 120,
      mobileHidden: true,
    },
  ];

  return (
    <MatrxDataTable<PayPeriodRow>
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      zebra
      searchText={(row) =>
        `${row.payGroupName} ${row.periodStartOn} ${row.periodEndOn} ${row.state}`
      }
      toolbar={{ search: true, searchPlaceholder: "Search pay periods…" }}
      onRowOpen={(row) => router.push(hrefFor(row))}
      emptyState={{
        title: "No pay periods yet",
        description:
          "Pay periods are generated from a pay group's calendar. Once a pay group has a calendar, its periods appear here and move through the lifecycle as time is submitted, approved, exported and locked.",
      }}
    />
  );
}
