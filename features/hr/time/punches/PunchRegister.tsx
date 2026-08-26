"use client";

/**
 * features/hr/time/punches/PunchRegister.tsx — ROUTE 30, `/hr/time/punches` (L3-60, §2.5).
 *
 * 🚨 **NO COMPUTED VALUE APPEARS ANYWHERE ON THIS PAGE.** No interval, no rounded figure, no total,
 * no hours. §2.5: *"that is the entire point of it existing separately."* If you are here to add a
 * "total hours" column because it would be convenient, that convenience is the defect — the
 * computed lane is routes 5, 28 and 29, and every row here links to its day there.
 *
 * 🚨 **VOIDS ARE STRUCK THROUGH WITH THE VOIDING PUNCH AS A DOOR — NEVER HIDDEN.** The "include
 * voided" filter defaults to ON and the surface says so; a hidden void is a destroyed record.
 *
 * 🚨 **THE PHOTO IS A DOOR BEHIND A SENSITIVITY GATE, NOT AN INLINE THUMBNAIL.** §2.5: it sits
 * behind the same gate as any other employee image. This column reports presence and offers the
 * door; it never renders the image in a list.
 *
 * 🚨 `sourceIp` IS SHOWN ONLY TO A VIEWER WITH PUNCH-EDIT AUTHORITY, AND TO AN EMPLOYEE FOR THEIR
 * OWN PUNCHES — never in a list a peer can see (§4.7). The server decides by sending `null`; this
 * surface renders what it is given and asks for nothing extra.
 */

import { useState } from "react";
import Link from "next/link";
import { Download, Eraser, PencilLine } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { toast } from "@/lib/toast";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { hrTimesheetHref } from "@/features/hr/routes";

import { getPunchRegister } from "../api/service";
import type { Paged, PunchRow } from "../api/types";
import { formatLocalDate, formatStampedTimeWithZone, pluralize } from "../shared/format";
import { HrTimeReadState } from "../shared/RefusalNotice";
import { StampedTime } from "../shared/timing";
import { useHrMockCase, useHrTimeQuery } from "../shared/useHrTimeQuery";
import {
  ACTOR_TYPE_LABELS,
  PUNCH_KIND_LABELS,
  PUNCH_SOURCE_LABELS,
} from "../shared/vocabulary";
import { PunchCorrectionDialog, type PunchCorrectionMode } from "./PunchCorrectionDialog";
import { downloadPunchRegisterCsv, punchRegisterToCsv } from "./registerCsv";

const DEFAULT_PAGE_SIZE = 50;

export function PunchRegister({
  employmentId,
  /** A manager without punch-edit authority gets the read-only lane; so does an employee. */
  canEdit = true,
}: {
  employmentId?: string | null;
  canEdit?: boolean;
}) {
  const mockCase = useHrMockCase();
  const { prefs } = useListViewPrefs("hr-time-punches", { pageSize: DEFAULT_PAGE_SIZE });
  const [query, setQuery] = useState<MatrxDataTableQueryState>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    search: "",
    anyOf: "",
    columnFilters: {},
    sort: null,
  });
  const [correcting, setCorrecting] = useState<{ punches: PunchRow[]; mode: PunchCorrectionMode } | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const register = useHrTimeQuery<Paged<PunchRow>>(
    (signal) =>
      getPunchRegister(
        {
          employmentIds: employmentId ? [employmentId] : undefined,
          // 🚨 Voids are IN by default. There is no code path that hides them silently.
          includeVoided: true,
        },
        {
          page: query.page,
          pageSize: query.pageSize,
          sort: query.sort
            ? [{ column: query.sort.id, direction: query.sort.direction }]
            : [{ column: "occurred_at", direction: "desc" }],
        },
        { mockCase, signal },
      ),
    [employmentId, query, mockCase],
  );

  const rows = register.data?.rows ?? [];
  const selected = rows.filter((row) => selectedIds.includes(row.id));

  function exportCsv() {
    const csv = punchRegisterToCsv(rows, {});
    downloadPunchRegisterCsv(csv, `punch-register-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(`${pluralize(rows.length, "punch", "punches")} exported.`);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-3 py-3 sm:px-4">
      <header className="space-y-1">
        <p className="text-xs text-muted-foreground">
          Exactly what the clock recorded, in the time zone each punch was stamped in. Nothing on
          this page is calculated — no hours, no rounding, no totals. Voided punches are shown struck
          through, never removed.
        </p>
      </header>

      <HrTimeReadState loading={register.loading} error={register.error}>
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={exportCsv}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden />
              Export this view
            </Button>
            {canEdit && selected.length > 0 ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setCorrecting({ punches: selected, mode: "correct" })}
                >
                  <PencilLine className="mr-1.5 h-4 w-4" aria-hidden />
                  Correct {pluralize(selected.length, "punch", "punches")}
                </Button>
                {selected.length === 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCorrecting({ punches: selected, mode: "void" })}
                  >
                    <Eraser className="mr-1.5 h-4 w-4" aria-hidden />
                    Void it
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="min-h-0 flex-1">
            <MatrxDataTable<PunchRow>
              data={rows}
              columns={punchColumns()}
              getRowId={(row) => row.id}
              isLoading={register.loading}
              isFetching={register.refreshing}
              query={{
                mode: "controlled",
                state: query,
                totalItems: register.data?.totalRows ?? 0,
                onStateChange: setQuery,
              }}
              pageSize={prefs.pageSize}
              selection={
                canEdit
                  ? {
                      selectedIds,
                      onSelectedIdsChange: setSelectedIds,
                      noun: "punch",
                      // A correction on an already-voided punch is not a thing — the record is closed.
                      isRowSelectable: (row) => row.voidedAt === null,
                    }
                  : undefined
              }
              mobileCardsBreakpoint="lg"
              mobileCards={(row) => <MobilePunchRow punch={row} />}
              emptyState={{
                title: "No punches match these filters",
                description:
                  "Widen the date range or clear a filter. An empty register is not the same as nobody clocking in.",
              }}
            />
          </div>
        </>
      </HrTimeReadState>

      <PunchCorrectionDialog
        open={correcting !== null}
        onOpenChange={(next) => (next ? undefined : setCorrecting(null))}
        punches={correcting?.punches ?? []}
        mode={correcting?.mode ?? "correct"}
        adjustmentHref="/hr/time/periods"
        mockCase={mockCase}
        onCommitted={() => {
          setSelectedIds([]);
          register.refetch();
        }}
      />
    </div>
  );
}

function punchColumns(): MatrxColumnDef<PunchRow>[] {
  return [
    {
      id: "localWorkDate",
      accessorKey: "localWorkDate",
      header: "Work date",
      // The door onto this punch's day in the COMPUTED lane — the only place hours may be read.
      cell: (row) => (
        <Link
          href={hrTimesheetHref(row.employmentId)}
          className="underline underline-offset-4"
        >
          {formatLocalDate(row.localWorkDate, { weekday: true })}
        </Link>
      ),
    },
    {
      id: "occurredAt",
      accessorKey: "occurredAt",
      header: "Recorded at",
      cell: (row) => (
        <span className={row.voidedAt ? "line-through decoration-2" : undefined}>
          <StampedTime at={row.occurredAt} tz={row.tz} />
        </span>
      ),
    },
    {
      id: "punchKind",
      accessorKey: "punchKind",
      header: "Punch",
      filter: "select",
      cell: (row) => (
        <span className={row.voidedAt ? "line-through decoration-2" : undefined}>
          {PUNCH_KIND_LABELS[row.punchKind]}
        </span>
      ),
    },
    {
      id: "source",
      accessorKey: "source",
      header: "Recorded on",
      filter: "select",
      cell: (row) => PUNCH_SOURCE_LABELS[row.source],
    },
    {
      id: "actorType",
      accessorKey: "actorType",
      header: "Recorded by",
      filter: "select",
      cell: (row) => (
        <span>
          {ACTOR_TYPE_LABELS[row.actorType]}
          {row.actorNote ? (
            <span className="block text-[11px] text-muted-foreground">{row.actorNote}</span>
          ) : null}
        </span>
      ),
    },
    {
      id: "jurisdictionKey",
      accessorKey: "jurisdictionKey",
      header: "Jurisdiction",
      cell: (row) => row.jurisdictionKey ?? "Not stamped",
    },
    { id: "tz", accessorKey: "tz", header: "Time zone", mobileHidden: true },
    {
      id: "deviceReportedAt",
      accessorKey: "deviceReportedAt",
      header: "Device said",
      mobileHidden: true,
      cell: (row) =>
        row.deviceReportedAt ? (
          <span title="What the device claimed, kept raw forever">
            {formatStampedTimeWithZone(row.deviceReportedAt, row.tz)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "clockSkewAppliedSeconds",
      accessorKey: "clockSkewAppliedSeconds",
      header: "Clock correction",
      align: "right",
      mobileHidden: true,
      cell: (row) =>
        row.clockSkewAppliedSeconds === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <span className="tabular-nums">
            {row.clockSkewAppliedSeconds > 0 ? "+" : ""}
            {row.clockSkewAppliedSeconds}s
          </span>
        ),
    },
    {
      id: "hasGeo",
      accessorKey: "hasGeo",
      header: "Location",
      cell: (row) =>
        row.hasGeo ? (
          <span>
            Captured
            {row.geoAccuracyM !== null ? (
              <span className="block text-[11px] text-muted-foreground">
                ±{row.geoAccuracyM}m
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-muted-foreground">No</span>
        ),
    },
    {
      id: "hasPhoto",
      accessorKey: "hasPhoto",
      header: "Photo",
      // A DOOR, never a thumbnail. Presence in the list; the image behind the gate.
      cell: (row) =>
        row.hasPhoto ? (
          <button
            type="button"
            onClick={() => void announceComingSoon("hr.punch-photo")}
            className="underline decoration-dotted underline-offset-4"
          >
            View photo
          </button>
        ) : (
          <span className="text-muted-foreground">No</span>
        ),
    },
    {
      id: "voidedAt",
      accessorKey: "voidedAt",
      header: "Void",
      cell: (row) =>
        row.voidedAt === null ? (
          <span className="text-muted-foreground">Live</span>
        ) : (
          <span className="text-xs">
            <span className="font-medium">Voided</span>
            {row.voidedReason ? (
              <span className="block text-muted-foreground">{row.voidedReason}</span>
            ) : null}
            {row.voidedByPunchId ? (
              <span className="block font-mono text-[10px] text-muted-foreground">
                replaced by {row.voidedByPunchId.slice(0, 8)}
              </span>
            ) : null}
          </span>
        ),
    },
    {
      id: "duplicateSuspectedGroup",
      accessorFn: (row) => row.duplicateSuspectedGroup ?? "",
      header: "Possible duplicate",
      mobileHidden: true,
      cell: (row) =>
        row.duplicateSuspectedGroup ? (
          <span className="font-medium text-amber-700 dark:text-amber-300">
            Grouped with a near-identical punch
          </span>
        ) : (
          <span className="text-muted-foreground">No</span>
        ),
    },
    {
      id: "sourceIp",
      accessorKey: "sourceIp",
      header: "IP address",
      mobileHidden: true,
      // Present only when the server sent it. Its absence is the privacy posture working.
      cell: (row) =>
        row.sourceIp ? (
          <span className="font-mono text-[11px]">{row.sourceIp}</span>
        ) : (
          <span className="text-muted-foreground">Not shown</span>
        ),
    },
  ];
}

function MobilePunchRow({ punch }: { punch: PunchRow }) {
  return (
    <div className="space-y-0.5 border-b border-border px-3 py-2.5 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className={punch.voidedAt ? "font-medium line-through decoration-2" : "font-medium"}>
          {PUNCH_KIND_LABELS[punch.punchKind]}
        </span>
        <span className={punch.voidedAt ? "line-through decoration-2" : undefined}>
          {formatStampedTimeWithZone(punch.occurredAt, punch.tz)}
        </span>
      </div>
      <p className="text-muted-foreground">
        {formatLocalDate(punch.localWorkDate, { weekday: true })} ·{" "}
        {ACTOR_TYPE_LABELS[punch.actorType]} · {PUNCH_SOURCE_LABELS[punch.source]}
      </p>
      {punch.voidedAt ? (
        <p className="text-muted-foreground">Voided — {punch.voidedReason}</p>
      ) : null}
    </div>
  );
}
