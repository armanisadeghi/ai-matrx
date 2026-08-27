"use client";

/**
 * features/hr/time/timesheet/PeriodApprovalGrid.tsx — ROUTE 28, `/hr/time/timesheets`
 * (L3-51, L3-52, L3-53, L3-56, L3-58, L3-77).
 *
 * 🚨 TWO STATE MACHINES, LABELLED DISTINCTLY (§14 D8, L3-51). The ROW state is
 * `pay_period_employment.state` — `open · attested · disputed · approved · exported · locked`, and
 * **`submitted` is never a row state.** The HEADER state is `pay_period.state`, a different machine
 * with seven members. They share three member names, so the header carries the word "Pay period"
 * and an **"N of M approved"** progress figure, and the row chips are shaped differently. Confusing
 * the two is how somebody believes a 400-person pay group moved because one timecard did.
 *
 * 🚨 CELLS SHOW THE COMPUTED VALUE. THE RAW PUNCHES BEHIND A CELL OPEN BESIDE THE GRID, IN A
 * `DataRowWindow`. **Raw and computed are never conflated in one cell** (AD-11). That window wraps
 * the canonical punch renderer (`PunchChain`) rather than re-drawing punches — a bespoke window
 * body is a second renderer that drifts.
 *
 * 🚨 APPROVING ONE PERSON NEVER MOVES THE PERIOD (§6.4). It closes that employment's step and sets
 * that row to `approved`. The period transitions on routes 32/33 as a separate deliberate act by
 * whoever holds that authority, and this surface links there rather than offering it.
 *
 * 🚨 `varianceMinutes: null` RENDERS THE WORDS "Not scheduled" — never `0`, which reads as perfect
 * adherence (§6.2). The sign is explained in words for the same reason: `-35` does not tell a
 * manager whether the person was short or long.
 */

import { useState } from "react";
import Link from "next/link";
import { CheckCheck, PanelRightOpen } from "lucide-react";

import { DataRowWindow } from "@/components/official/matrx-data-table/DataRowWindow";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import {
  hrTimeExceptionsHref,
  hrTimePeriodHref,
  hrTimePeriodsHref,
  hrTimesheetHref,
} from "@/features/hr/routes";

import { getPeriodGrid } from "../api/service";
import { getPayPeriod } from "../periods/api/periodReads";
import { listAttendanceExceptions } from "../exceptions/api";
import type {
  AttendanceExceptionRow,
  PayPeriodRow,
  Paged,
  PeriodGridRow,
} from "../api/types";
import { PeriodStateChip, RowStateChip } from "../shared/badges";
import { ExceptionsStrip } from "../shared/ExceptionsStrip";
import { formatHours, formatVariance, pluralize } from "../shared/format";
import { HrTimeReadState } from "../shared/RefusalNotice";
import { RuleSnapshotProvider } from "../shared/RuleSnapshot";
import { useHrMockCase, useHrTimeQuery } from "../shared/useHrTimeQuery";
import { BulkApproveDialog, splitForBulk } from "./BulkApproveDialog";
import { RawPunchesWindowBody } from "./RawPunchesWindowBody";

/**
 * ⚠️ `wf.inbox.bulk_max` IS A KNOB AND THIS IS NOT IT (CLAUDE.md § limits are knobs).
 * The time lane has no knob read of its own; `public.hr_knob_index` exists live and belongs to the
 * core lane. Until this surface reads it, the ceiling is stated here in one place, and the server
 * enforces the real one — the refusal names the true limit, so a stale value here shows the user a
 * correct sentence rather than a silent truncation. Owed: wire `hr_knob_index`.
 */
const HR_BULK_APPROVE_MAX = 50;

const DEFAULT_PAGE_SIZE = 50;

export function PeriodApprovalGrid({ payPeriodId }: { payPeriodId: string | null }) {
  const mockCase = useHrMockCase();
  const { prefs } = useListViewPrefs("hr-time-timesheets", {
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [query, setQuery] = useState<MatrxDataTableQueryState>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    anyOf: "",
    columnFilters: {},
    sort: null,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [rawFor, setRawFor] = useState<PeriodGridRow | null>(null);

  const grid = useHrTimeQuery<Paged<PeriodGridRow>>(
    (signal) =>
      getPeriodGrid(
        payPeriodId as string,
        {
          search: query.search || undefined,
          // §6.2's filter set, driven from the table's own column filters so every column both
          // sorts AND filters without a second filter UI beside it.
          ...readFilters(query),
        },
        {
          page: query.page,
          pageSize: query.pageSize,
          /**
           * DEFAULT SORT PUTS DECISIONS FIRST (§6.2): exceptions, then disputes, then overtime,
           * then clean. It is asked of the SERVER rather than sorted here, because the client only
           * holds the current page and a client sort would reorder 50 rows out of 400.
           */
          sort: query.sort
            ? [{ column: query.sort.id, direction: query.sort.direction }]
            : [
                { column: "open_exception_count", direction: "desc" },
                { column: "has_dispute", direction: "desc" },
                { column: "hours_overtime", direction: "desc" },
                { column: "employee_display_name", direction: "asc" },
              ],
        },
        { mockCase, signal },
      ),
    [payPeriodId, query, mockCase],
    Boolean(payPeriodId),
  );

  /** The strip's own read — rows, not counts, so each one can be resolved without leaving. */
  const strip = useHrTimeQuery<Paged<AttendanceExceptionRow>>(
    (signal) =>
      listAttendanceExceptions(
        /*
         * ⚠️ There is no pay-period filter on `hr.attendance_exception_list` (verified live) — its
         * axes are resolution state, kind, severity, employment, location and a date range. So the
         * strip asks for what it can honestly ask for: everything still OPEN and sitting on a
         * period nobody has approved. Narrowing to THIS period needs a `pay_period_id` filter on
         * the contract; recorded for the lane owner rather than faked with a date range that would
         * silently miss a boundary week.
         */
        { resolutionState: "open", affectsUnapprovedPeriod: true },
        { page: 1, pageSize: 200 },
        { mockCase, signal },
      ),
    [payPeriodId, mockCase],
    Boolean(payPeriodId),
  );

  /** The HEADER's period — a different state machine from the rows, read from the periods lane. */
  const period = useHrTimeQuery<PayPeriodRow>(
    (signal) => getPayPeriod(payPeriodId as string, { mockCase, signal }),
    [payPeriodId, mockCase],
    Boolean(payPeriodId),
  );

  if (!payPeriodId) return <NoPeriodChosen />;

  const rows = grid.data?.rows ?? [];
  const selectedRows = rows.filter((row) => selectedIds.includes(row.employmentId));

  return (
    <RuleSnapshotProvider>
      <div className="flex h-full min-h-0 flex-col gap-3 px-3 py-3 sm:px-4">
        {period.data ? <PeriodGridHeader period={period.data} /> : null}

        <HrTimeReadState loading={grid.loading} error={grid.error}>
          <>
            {/*
             * The strip sits ABOVE the grid and says so even when it is empty.
             * It reads the exception ROWS rather than the grid's per-row counts, because §5.4
             * requires each row to be resolvable INLINE — a count cannot be acknowledged.
             */}
            <ExceptionsStrip
              exceptions={strip.data?.rows ?? []}
              mockCase={mockCase}
              onResolved={() => {
                strip.refetch();
                grid.refetch();
              }}
            />

            <BulkBar
              selectedRows={selectedRows}
              onOpen={() => setBulkOpen(true)}
              onClear={() => setSelectedIds([])}
            />

            {/* MOBILE (UI-IA §7): a READ-optimized list that says editing is not a phone claim,
                rather than a squeezed grid nobody can approve from. */}
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs lg:hidden">
              This is a read-only view on a small screen. Approving timecards needs a wider screen —
              open this on a laptop when you are ready to decide.
            </p>

            <div className="min-h-0 flex-1">
              <MatrxDataTable<PeriodGridRow>
                data={rows}
                columns={columns(setRawFor)}
                getRowId={(row) => row.employmentId}
                isLoading={grid.loading}
                isFetching={grid.refreshing}
                query={{
                  mode: "controlled",
                  state: query,
                  totalItems: grid.data?.totalRows ?? 0,
                  onStateChange: setQuery,
                }}
                pageSize={prefs.pageSize}
                selection={{
                  selectedIds,
                  onSelectedIdsChange: setSelectedIds,
                  noun: "timecard",
                  // Rows with an open exception cannot ride a bulk decision (§6.3).
                  isRowSelectable: (row) => row.openExceptionCount === 0 && row.openStepId !== null,
                }}
                mobileCardsBreakpoint="lg"
                mobileCards={(row) => <MobileRow row={row} />}
                emptyState={{
                  title: "No timecards match these filters",
                  description:
                    "Every timecard in this pay group is either filtered out or has not been created yet.",
                }}
              />
            </div>

            <AssistStrip surfaceName="matrx-user/hr-time" />
          </>
        </HrTimeReadState>
      </div>

      <BulkApproveDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        rows={selectedRows}
        bulkMax={HR_BULK_APPROVE_MAX}
        mockCase={mockCase}
        onCommitted={() => {
          setSelectedIds([]);
          grid.refetch();
        }}
      />

      {/* 🚨 THE RAW PUNCHES, BESIDE THE GRID — never inside a cell. */}
      <DataRowWindow
        isOpen={rawFor !== null}
        onClose={() => setRawFor(null)}
        title={rawFor ? `Raw punches — ${rawFor.employeeDisplayName}` : "Raw punches"}
        windowId="hr-time-grid-raw-punches"
        width={720}
        height={620}
        viewContent={
          rawFor && payPeriodId ? (
            <RawPunchesWindowBody
              employmentId={rawFor.employmentId}
              payPeriodId={payPeriodId}
              mockCase={mockCase}
            />
          ) : null
        }
      />
    </RuleSnapshotProvider>
  );
}

/** Translate the table's own column filters into the §6.2 filter set the RPC takes. */
function readFilters(query: MatrxDataTableQueryState) {
  const filters: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(query.columnFilters)) {
    if (!value) continue;
    if (id === "state" && value.kind === "select") {
      filters.rowStates = value.values ?? [value.value];
    }
    if (id === "hasDispute" && value.kind === "boolean") filters.hasDispute = value.value;
    if (id === "openExceptionCount" && value.kind === "boolean") {
      filters.hasOpenException = value.value;
    }
    if (id === "hoursOvertime" && value.kind === "boolean") filters.hasOvertime = value.value;
    if (id === "premiumLineCount" && value.kind === "boolean") filters.hasPremium = value.value;
    if (id === "hasAutoClosedPunch" && value.kind === "boolean") {
      filters.hasAutoClosedPunch = value.value;
    }
    if (id === "recomputedSinceApproval" && value.kind === "boolean") {
      filters.recomputedSinceApproval = value.value;
    }
    if (id === "varianceMinutes" && value.kind === "boolean") {
      filters.varianceBeyondWarn = value.value;
    }
  }
  return filters;
}

function columns(
  openRaw: (row: PeriodGridRow) => void,
): MatrxColumnDef<PeriodGridRow>[] {
  return [
    {
      id: "employeeDisplayName",
      accessorKey: "employeeDisplayName",
      header: "Employee",
      // A real anchor — cmd-click and middle-click open route 29 in a new tab (the door law).
      href: (row) => hrTimesheetHref(row.employmentId),
      cell: (row) => (
        <span className="font-medium">{row.employeeDisplayName}</span>
      ),
    },
    { id: "employeeNumber", accessorKey: "employeeNumber", header: "Number", mobileHidden: true },
    { id: "departmentName", accessorKey: "departmentName", header: "Department" },
    { id: "locationName", accessorKey: "locationName", header: "Location" },
    { id: "managerName", accessorKey: "managerName", header: "Manager", mobileHidden: true },
    {
      id: "state",
      accessorKey: "state",
      header: "Timecard",
      filter: "select",
      cell: (row) => <RowStateChip state={row.state} />,
    },
    {
      id: "totalHours",
      accessorKey: "totalHours",
      header: "Hours",
      align: "right",
      // The COMPUTED value, with the raw evidence one click away — never in the same cell.
      cell: (row) => (
        <button
          type="button"
          onClick={() => openRaw(row)}
          title="Open the raw punches behind this figure"
          className="inline-flex items-center gap-1 rounded px-1 tabular-nums underline decoration-dotted underline-offset-4 hover:bg-accent"
        >
          {formatHours(row.totalHours)}
          <PanelRightOpen className="h-3 w-3 opacity-60" aria-hidden />
        </button>
      ),
    },
    {
      id: "hoursOvertime",
      accessorKey: "hoursOvertime",
      header: "Overtime",
      align: "right",
      cell: (row) => (
        <span
          className={
            row.hoursOvertime > 0
              ? "font-semibold tabular-nums text-amber-700 dark:text-amber-300"
              : "tabular-nums text-muted-foreground"
          }
        >
          {formatHours(row.hoursOvertime)}
        </span>
      ),
    },
    {
      id: "hoursDoubletime",
      accessorKey: "hoursDoubletime",
      header: "Double time",
      align: "right",
      mobileHidden: true,
      cell: (row) => <span className="tabular-nums">{formatHours(row.hoursDoubletime)}</span>,
    },
    {
      id: "premiumLineCount",
      accessorKey: "premiumLineCount",
      header: "Premium lines",
      align: "right",
      mobileHidden: true,
    },
    {
      id: "varianceMinutes",
      accessorFn: (row) => row.varianceMinutes,
      header: "Against schedule",
      // 🚨 The WORDS. Never the number, never a 0 standing in for "no schedule".
      cell: (row) => (
        <span
          className={
            row.varianceMinutes === null ? "text-muted-foreground" : undefined
          }
        >
          {formatVariance(row.varianceMinutes)}
        </span>
      ),
    },
    {
      id: "openExceptionCount",
      accessorKey: "openExceptionCount",
      header: "Exceptions",
      align: "right",
      cell: (row) =>
        row.openExceptionCount === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <Link
            href={hrTimeExceptionsHref(undefined, { employment: row.employmentId })}
            className="font-medium underline underline-offset-4"
          >
            {row.openExceptionCount}
          </Link>
        ),
    },
    {
      id: "hasDispute",
      accessorKey: "hasDispute",
      header: "Disagreement",
      cell: (row) =>
        row.hasDispute ? (
          <span className="font-medium text-orange-700 dark:text-orange-300">
            Employee disagrees
          </span>
        ) : (
          <span className="text-muted-foreground">No</span>
        ),
    },
    {
      id: "recomputedSinceApproval",
      accessorKey: "recomputedSinceApproval",
      header: "Changed after approval",
      mobileHidden: true,
      cell: (row) =>
        row.recomputedSinceApproval ? (
          <span className="font-medium text-amber-700 dark:text-amber-300">
            Needs approving again
          </span>
        ) : (
          <span className="text-muted-foreground">No</span>
        ),
    },
    {
      id: "hasAutoClosedPunch",
      accessorKey: "hasAutoClosedPunch",
      header: "Estimated punch",
      mobileHidden: true,
      cell: (row) =>
        row.hasAutoClosedPunch ? (
          <span className="font-medium">Yes — an estimate is included</span>
        ) : (
          <span className="text-muted-foreground">No</span>
        ),
    },
  ];
}

function BulkBar({
  selectedRows,
  onOpen,
  onClear,
}: {
  selectedRows: PeriodGridRow[];
  onOpen: () => void;
  onClear: () => void;
}) {
  if (selectedRows.length === 0) return null;
  const { eligible, excludedForExceptions } = splitForBulk(selectedRows);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
      <span className="text-sm">
        {pluralize(eligible.length, "timecard")} selected
        {excludedForExceptions.length > 0
          ? ` · ${excludedForExceptions.length} held back by open exceptions`
          : ""}
      </span>
      <Button type="button" size="sm" onClick={onOpen} disabled={eligible.length === 0}>
        <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden />
        Review and approve
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

/** The phone rendering: the figures that matter, and no controls that pretend to edit. */
function MobileRow({ row }: { row: PeriodGridRow }) {
  return (
    <div className="space-y-1 border-b border-border px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <Link
          href={hrTimesheetHref(row.employmentId)}
          className="text-sm font-medium underline underline-offset-4"
        >
          {row.employeeDisplayName}
        </Link>
        <RowStateChip state={row.state} />
      </div>
      <p className="text-xs tabular-nums">
        {formatHours(row.totalHours)} hours · {formatHours(row.hoursOvertime)} overtime
      </p>
      <p className="text-xs text-muted-foreground">{formatVariance(row.varianceMinutes)}</p>
      {row.openExceptionCount > 0 ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {pluralize(row.openExceptionCount, "open exception")}
        </p>
      ) : null}
      {row.hasDispute ? (
        <p className="text-xs text-orange-700 dark:text-orange-300">Employee disagrees</p>
      ) : null}
    </div>
  );
}

/**
 * 🚨 THE HEADER — where the two state machines are told apart, with the progress figure §6.4
 * requires so they can never be confused.
 */
export function PeriodGridHeader({ period }: { period: PayPeriodRow }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <PeriodStateChip state={period.state} />
      <span className="text-xs text-muted-foreground">
        {/* "38 of 41 approved" — the count of ROWS, beside the PERIOD's own state. */}
        {period.counts.approved} of {period.counts.employments} timecards approved
      </span>
      <Link
        href={hrTimePeriodHref(period.id)}
        className="text-xs font-medium underline underline-offset-4"
      >
        Move the pay period
      </Link>
    </div>
  );
}

function NoPeriodChosen() {
  return (
    <div className="px-4 py-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-base font-semibold">Choose a pay period</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This grid approves one pay group&rsquo;s timecards for one pay period. Pick the period you
          want to work through.
        </p>
        <Link
          href={hrTimePeriodsHref()}
          className="mt-3 inline-flex text-sm font-medium underline underline-offset-4"
        >
          Open pay periods
        </Link>
      </section>
    </div>
  );
}
