"use client";

/**
 * features/hr/time/exceptions/ExceptionsQueue.tsx — ROUTE 31, `/hr/time/exceptions`
 * (L3-61, L3-82; SPEC-TIME §2.6, §4.3).
 *
 * The surface that makes the scheduled-vs-actual join real instead of two screens a manager
 * reconciles by eye.
 *
 * 🚨 **THE ACTIONS COME FROM EACH ROW'S OWN `allowedResolutions`, NEVER A HARDCODED LIST.**
 * `excused` is **absent** on `severity='violation'` — a statutory-premium exception cannot be
 * excused into nonexistence and an org cannot configure that away. The server refuses it too: the
 * control's absence is courtesy, the refusal is the contract. `ExceptionResolveControls` is the one
 * component that renders them, shared with the strip on routes 28 and 29 so the two can never
 * diverge.
 *
 * 🚨 **BULK ACKNOWLEDGE CARRIES A PRE-COMMIT MANIFEST** (§2.6, §6.3's discipline applied here).
 * Acknowledging is the one bulk action that needs no note; that is exactly why it needs a list of
 * what is about to be acknowledged.
 *
 * 🚨 **THE ASSIST CHIP IS RECOMMENDATION-ONLY** (L3-82, §11). `hr.timecard.exception_triage` ranks
 * which rows plausibly need a human and says why in one sentence. **Detection is deterministic and
 * already happened** — every row here was written by a detector in §4.3. The AI never creates,
 * closes or changes an exception, and there is no control on this page that would let it.
 * `anomaly_flag` and `nl_query` are out of v1 scope and no seam is left for them.
 */

import { useState } from "react";
import Link from "next/link";
import { CheckCheck } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { toast } from "@/lib/toast";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { hrTimeExceptionsHref, hrTimesheetHref } from "@/features/hr/routes";

import { resolveAttendanceException } from "../api/service";
import type {
  AttendanceExceptionKind,
  AttendanceExceptionRow,
  Paged,
} from "../api/types";
import { SeverityChip } from "../shared/badges";
import { ExceptionSentence } from "../shared/ExceptionDoor";
import { ExceptionResolveControls } from "../shared/ExceptionsStrip";
import { formatLocalDate, formatVariance, pluralize } from "../shared/format";
import { HrTimeReadState, RefusalNotice } from "../shared/RefusalNotice";
import { useHrMockCase, useHrTimeQuery } from "../shared/useHrTimeQuery";
import { EXCEPTION_KIND_LABELS, RESOLUTION_LABELS } from "../shared/vocabulary";
import { listAttendanceExceptions } from "./api";

const DEFAULT_PAGE_SIZE = 50;

/** ⚠️ The server's real ceiling. Stated once; the refusal names the true limit. See route 28's note. */
const HR_BULK_ACKNOWLEDGE_MAX = 50;

export function ExceptionsQueue({
  kind,
  employmentId,
  /**
   * A single `local_work_date`, from an exception door on the clock, the timesheet or the strip.
   * It narrows to that ONE day so the reader lands on the row they clicked, not on the queue.
   */
  day,
  /** An employee sees their own exceptions read-only (§2.6 role variations). */
  readOnly = false,
}: {
  kind?: AttendanceExceptionKind | null;
  employmentId?: string | null;
  day?: string | null;
  readOnly?: boolean;
}) {
  const mockCase = useHrMockCase();
  const { prefs } = useListViewPrefs("hr-time-exceptions", { pageSize: DEFAULT_PAGE_SIZE });
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

  const queue = useHrTimeQuery<Paged<AttendanceExceptionRow>>(
    (signal) =>
      listAttendanceExceptions(
        {
          exceptionKinds: kind ? [kind] : undefined,
          employmentIds: employmentId ? [employmentId] : undefined,
          // A work DATE, not an instant — `from`/`to` bracket the single day.
          from: day ?? undefined,
          to: day ?? undefined,
          search: query.search || undefined,
          ...readFilters(query),
        },
        {
          page: query.page,
          pageSize: query.pageSize,
          sort: query.sort
            ? [{ column: query.sort.id, direction: query.sort.direction }]
            : // Severity then age — the §5.4 ordering, asked of the server.
              [
                { column: "severity_rank", direction: "desc" },
                { column: "detected_at", direction: "asc" },
              ],
        },
        { mockCase, signal },
      ),
    [kind, employmentId, day, query, mockCase],
  );

  const rows = queue.data?.rows ?? [];
  const selected = rows.filter((row) => selectedIds.includes(row.id));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-3 py-3 sm:px-4">
      <header className="space-y-1">
        <p className="text-xs text-muted-foreground">
          Every row here was raised by a rule, not by a person and not by a model. What you decide is
          recorded against the row.
        </p>
        {kind || day || employmentId ? (
          <p className="text-xs">
            Filtered to{" "}
            <span className="font-medium">
              {[
                kind ? EXCEPTION_KIND_LABELS[kind] : null,
                day ? formatLocalDate(day, { weekday: true, year: true }) : null,
                employmentId ? "one person" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>{" "}
            ·{" "}
            <Link href={hrTimeExceptionsHref()} className="underline underline-offset-4">
              show everything
            </Link>
          </p>
        ) : null}
      </header>

      <HrTimeReadState loading={queue.loading} error={queue.error}>
        <>
          {!readOnly && selected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
              <span className="text-sm">{pluralize(selected.length, "exception")} selected</span>
              <Button type="button" size="sm" onClick={() => setBulkOpen(true)}>
                <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden />
                Review and acknowledge
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                Clear
              </Button>
            </div>
          ) : null}

          <div className="min-h-0 flex-1">
            <MatrxDataTable<AttendanceExceptionRow>
              data={rows}
              columns={exceptionColumns({ readOnly, mockCase, onResolved: queue.refetch })}
              getRowId={(row) => row.id}
              isLoading={queue.loading}
              isFetching={queue.refreshing}
              query={{
                mode: "controlled",
                state: query,
                totalItems: queue.data?.totalRows ?? 0,
                onStateChange: setQuery,
              }}
              pageSize={prefs.pageSize}
              selection={
                readOnly
                  ? undefined
                  : {
                      selectedIds,
                      onSelectedIdsChange: setSelectedIds,
                      noun: "exception",
                      // Only rows the server will actually accept an acknowledgement on.
                      isRowSelectable: (row) =>
                        row.allowedResolutions.includes("acknowledged"),
                    }
              }
              mobileCardsBreakpoint="lg"
              mobileCards={(row) => (
                <MobileExceptionRow
                  exception={row}
                  readOnly={readOnly}
                  mockCase={mockCase}
                  onResolved={queue.refetch}
                />
              )}
              emptyState={{
                title: "Nothing open here",
                description:
                  "No attendance exceptions match these filters. That is not the same as none existing — widen the filters to be sure.",
              }}
            />
          </div>

          {/* L3-82: the call site, and nothing else. Recommendation only. */}
          <AssistStrip surfaceName="matrx-user/hr-time" />
        </>
      </HrTimeReadState>

      <BulkAcknowledgeDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        exceptions={selected}
        mockCase={mockCase}
        onCommitted={() => {
          setSelectedIds([]);
          queue.refetch();
        }}
      />
    </div>
  );
}

function readFilters(query: MatrxDataTableQueryState) {
  const filters: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(query.columnFilters)) {
    if (!value) continue;
    if (id === "resolutionState" && value.kind === "select") {
      filters.resolutionStates = value.values ?? [value.value];
    }
    if (id === "severity" && value.kind === "select") {
      filters.severities = value.values ?? [value.value];
    }
    if (id === "exceptionKind" && value.kind === "select") {
      filters.exceptionKinds = value.values ?? [value.value];
    }
  }
  return filters;
}

function exceptionColumns({
  readOnly,
  mockCase,
  onResolved,
}: {
  readOnly: boolean;
  mockCase: ReturnType<typeof useHrMockCase>;
  onResolved: () => void;
}): MatrxColumnDef<AttendanceExceptionRow>[] {
  return [
    {
      id: "employeeDisplayName",
      accessorKey: "employeeDisplayName",
      header: "Employee",
      href: (row) => hrTimesheetHref(row.employmentId),
      cell: (row) => (
        <span className="font-medium">{row.employeeDisplayName ?? "This employee"}</span>
      ),
    },
    {
      id: "localWorkDate",
      accessorKey: "localWorkDate",
      header: "Day",
      cell: (row) => formatLocalDate(row.localWorkDate, { weekday: true }),
    },
    {
      id: "exceptionKind",
      accessorKey: "exceptionKind",
      header: "What happened",
      filter: "select",
      cell: (row) => (
        <span>
          <span className="font-medium">{EXCEPTION_KIND_LABELS[row.exceptionKind]}</span>
          {/* The SERVER's sentence, not a token restated. */}
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{row.message}</span>
        </span>
      ),
    },
    {
      id: "severity",
      accessorKey: "severity",
      header: "Severity",
      filter: "select",
      cell: (row) => <SeverityChip severity={row.severity} />,
    },
    {
      id: "resolutionState",
      accessorKey: "resolutionState",
      header: "State",
      filter: "select",
      cell: (row) => (
        <span>
          {RESOLUTION_LABELS[row.resolutionState] === "Reopen"
            ? "Open"
            : RESOLUTION_LABELS[row.resolutionState]}
          {row.scheduleChangeId ? (
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              Caused by a schedule change made after publication
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "varianceMinutes",
      accessorFn: (row) => row.varianceMinutes,
      header: "Against schedule",
      cell: (row) => (
        <span className={row.varianceMinutes === null ? "text-muted-foreground" : undefined}>
          {formatVariance(row.varianceMinutes)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Decide",
      // The one column that must never sort or filter — it holds controls, not a value.
      filter: false,
      sortable: false,
      cell: (row) =>
        readOnly ? (
          <span className="text-[11px] text-muted-foreground">
            Your manager decides this. You can add a comment from your HR tasks.
          </span>
        ) : (
          <ExceptionResolveControls
            exception={row}
            mockCase={mockCase}
            onResolved={onResolved}
          />
        ),
    },
  ];
}

function MobileExceptionRow({
  exception,
  readOnly,
  mockCase,
  onResolved,
}: {
  exception: AttendanceExceptionRow;
  readOnly: boolean;
  mockCase: ReturnType<typeof useHrMockCase>;
  onResolved: () => void;
}) {
  return (
    <div className="space-y-1.5 border-b border-border px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          {exception.employeeDisplayName ?? "This employee"}
        </span>
        <SeverityChip severity={exception.severity} />
      </div>
      <p className="text-xs text-muted-foreground">
        {formatLocalDate(exception.localWorkDate, { weekday: true })} ·{" "}
        {EXCEPTION_KIND_LABELS[exception.exceptionKind]}
      </p>
      <ExceptionSentence exception={exception} tone="bare" />
      {!readOnly ? (
        <ExceptionResolveControls
          exception={exception}
          mockCase={mockCase}
          onResolved={onResolved}
        />
      ) : null}
    </div>
  );
}

/**
 * Bulk acknowledge, with its manifest.
 *
 * 🚨 It is a LOOP OF SINGLE RESOLUTIONS, not a bulk RPC, and that is deliberate: the contract for
 * exception resolution is `hr.attendance_exception_resolve`, one row at a time, and there is no
 * bulk sibling in the frozen set. Inventing a bulk endpoint on the client — one call that reports a
 * single outcome for many rows — would lose exactly the per-row reasons §6.3 requires. So each row
 * is resolved on its own and its own result is reported.
 */
function BulkAcknowledgeDialog({
  open,
  onOpenChange,
  exceptions,
  mockCase,
  onCommitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exceptions: AttendanceExceptionRow[];
  mockCase: ReturnType<typeof useHrMockCase>;
  onCommitted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [outcomes, setOutcomes] = useState<{ id: string; name: string; ok: boolean; reason?: string }[] | null>(
    null,
  );

  const eligible = exceptions.filter((exc) => exc.allowedResolutions.includes("acknowledged"));
  const violations = eligible.filter((exc) => exc.severity === "violation");
  const overCap = eligible.length > HR_BULK_ACKNOWLEDGE_MAX;

  async function commit() {
    setBusy(true);
    setError(null);
    const results: { id: string; name: string; ok: boolean; reason?: string }[] = [];
    for (const exc of eligible) {
      try {
        await resolveAttendanceException(exc.id, "acknowledged", null, null, { mockCase });
        results.push({ id: exc.id, name: exc.employeeDisplayName ?? exc.id, ok: true });
      } catch (caught) {
        results.push({
          id: exc.id,
          name: exc.employeeDisplayName ?? exc.id,
          ok: false,
          reason: caught instanceof Error ? caught.message : String(caught),
        });
      }
    }
    setOutcomes(results);
    setBusy(false);
    const ok = results.filter((r) => r.ok).length;
    if (ok > 0) toast.success(`${pluralize(ok, "exception")} acknowledged.`);
    onCommitted();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : (setOutcomes(null), onOpenChange(false)))}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {outcomes ? "What happened" : `Acknowledge ${pluralize(eligible.length, "exception")}`}
          </DialogTitle>
          <DialogDescription>
            {outcomes
              ? "Each exception was decided on its own."
              : "Acknowledging records that you have seen these and accept them as they stand. It does not pay anything, change anything, or close a statutory obligation."}
          </DialogDescription>
        </DialogHeader>

        <RefusalNotice error={error} />

        {outcomes ? (
          <ul className="space-y-1 text-xs">
            {outcomes.map((o) => (
              <li
                key={o.id}
                className={
                  o.ok
                    ? "rounded border border-border px-2.5 py-1.5"
                    : "rounded border border-destructive/40 bg-destructive/5 px-2.5 py-1.5"
                }
              >
                <span className="font-medium">{o.name}</span>
                {o.ok ? " — acknowledged" : ` — ${o.reason}`}
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3">
            {violations.length > 0 ? (
              <p className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs">
                {pluralize(violations.length, "of these is", "of these are")} a statutory violation.
                Acknowledging one does not excuse it and does not remove the premium that is owed —
                it records that you have seen it.
              </p>
            ) : null}

            {overCap ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
                You have selected {eligible.length} and the limit is {HR_BULK_ACKNOWLEDGE_MAX}.
                Narrow the selection.
              </p>
            ) : null}

            {/* THE MANIFEST. */}
            <ul className="space-y-1 rounded-md border border-border px-2.5 py-2 text-xs">
              {eligible.map((exc) => (
                <li key={exc.id}>
                  <span className="font-medium">{exc.employeeDisplayName ?? "This employee"}</span>{" "}
                  · {formatLocalDate(exc.localWorkDate, { weekday: true })} ·{" "}
                  {EXCEPTION_KIND_LABELS[exc.exceptionKind]}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          {outcomes ? (
            <Button
              type="button"
              onClick={() => {
                setOutcomes(null);
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={busy || overCap || eligible.length === 0}
                onClick={() => void commit()}
              >
                Acknowledge {pluralize(eligible.length, "exception")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
