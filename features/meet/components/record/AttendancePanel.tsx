"use client";

// features/meet/components/record/AttendancePanel.tsx
//
// WHO WAS THERE (Meet wave 3) — Zoom's participants report, from the durable
// `meet_participants` rows: when each person joined and left, how long they
// stayed, and as what (host, co-host, member, a signed-in person from outside
// the organization, a guest with no account, the assistant). CSV for a
// spreadsheet. A recurring meeting is one row with one link, so its report is
// the series' — said, not hidden.

import { Download } from "lucide-react";
import {
  absenceSentence,
  attendanceCsv,
  attendanceReport,
  attendanceTotals,
  type AttendanceKind,
  type MeetingRecord,
  type MeetingRecordBundle,
} from "@ai-matrx/meet/react";
import { formatDurationMs } from "@ai-matrx/kit/format";
import { Button } from "@/components/ui/button";
import { downloadBlob } from "@/utils/file-operations/utils";
import {
  MatrxDataTable,
  type MatrxColumnDef,
  type MatrxDataTableCopyConfig,
} from "@ai-matrx/design-system/data-table";

const KIND_LABEL: Record<AttendanceKind, string> = {
  host: "Host",
  cohost: "Co-host",
  member: "Member",
  "signed-in guest": "Outside guest",
  guest: "Guest",
  assistant: "Assistant",
};

function clock(iso: string | null): string {
  if (!iso) return "—";
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? "—"
    : at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

type AttendanceRow = ReturnType<typeof attendanceReport>[number];

function attendanceStatus(row: AttendanceRow): string {
  if (row.joinedAt !== null) return "Attended";
  return row.admission === "denied" ? "Not let in" : "Never joined";
}

function leftLabel(row: AttendanceRow): string {
  return row.leftAt ? clock(row.leftAt) : row.joinedAt ? "at end" : "—";
}

function timeLabel(row: AttendanceRow): string {
  return row.durationMs === null
    ? "—"
    : formatDurationMs(row.durationMs, { style: "compact" });
}

const ATTENDANCE_COLUMNS: MatrxColumnDef<AttendanceRow>[] = [
  {
    id: "name",
    header: "Name",
    accessorFn: (row) => row.name,
    cell: (row) => <span className="block truncate">{row.name}</span>,
    filter: "text",
    width: 220,
  },
  {
    id: "role",
    header: "Role",
    accessorFn: (row) => KIND_LABEL[row.kind],
    filter: "select",
    width: 120,
  },
  {
    id: "status",
    header: "Status",
    accessorFn: attendanceStatus,
    filter: "select",
    width: 120,
  },
  {
    id: "joined",
    header: "Joined",
    accessorFn: (row) => row.joinedAt ?? "",
    cell: (row) => <span className="tabular-nums">{clock(row.joinedAt)}</span>,
    copyValue: (row) => clock(row.joinedAt),
    width: 90,
  },
  {
    id: "left",
    header: "Left",
    accessorFn: (row) => row.leftAt ?? "",
    cell: (row) => <span className="tabular-nums">{leftLabel(row)}</span>,
    copyValue: leftLabel,
    width: 90,
  },
  {
    id: "time",
    header: "Time",
    accessorFn: (row) => row.durationMs ?? -1,
    cell: (row) => <span className="tabular-nums">{timeLabel(row)}</span>,
    copyValue: timeLabel,
    width: 90,
  },
];

const ATTENDANCE_COPY: MatrxDataTableCopyConfig<AttendanceRow> = {
  label: "Attendee",
  listLabel: "Attendance (this view)",
  location: "Meeting record — Attendance",
  rowKind: "meeting-attendee",
  listKind: "meeting-attendance",
  rowDescription: "One person's attendance of a meeting.",
  listDescription: "Who attended the meeting, as currently shown.",
  humanRow: (row) =>
    [
      `Name: ${row.name}`,
      `Role: ${KIND_LABEL[row.kind]}`,
      `Status: ${attendanceStatus(row)}`,
      `Joined: ${clock(row.joinedAt)}`,
      `Left: ${leftLabel(row)}`,
      `Time: ${timeLabel(row)}`,
    ].join("\n"),
};

export function fileSafe(title: string): string {
  return (
    title
      .replace(/[^\w\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "meeting"
  );
}

export function AttendancePanel({
  meeting,
  bundle,
}: {
  meeting: MeetingRecord;
  bundle: MeetingRecordBundle;
}) {
  const rows = attendanceReport(meeting, bundle.attendees, bundle.names);
  const totals = attendanceTotals(rows);

  if (rows.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {absenceSentence(
          bundle,
          "attendance",
          "Nobody is recorded as having attended.",
        )}
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{totals.people}</span>{" "}
          attended
        </span>
        {totals.guests > 0 ? <span>{totals.guests} guests</span> : null}
        {totals.averageMs !== null ? (
          <span>
            avg {formatDurationMs(totals.averageMs, { style: "compact" })}
          </span>
        ) : null}
        {totals.neverAdmitted > 0 ? (
          <span>{totals.neverAdmitted} not let in</span>
        ) : null}
        <Button
          icon={<Download aria-hidden="true" />}
          variant="quiet"
          className="ml-auto"
          onClick={() =>
            downloadBlob(
              new Blob([attendanceCsv([{ meeting, rows }])], {
                type: "text/csv;charset=utf-8",
              }),
              `${fileSafe(meeting.title)}-attendance.csv`,
            )
          }
        > CSV
        </Button>
      </div>
      {meeting.recurrenceRule ? (
        <p className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          A recurring meeting keeps one attendance list for the whole series:
          each person&apos;s first join and latest leave.
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <MatrxDataTable<AttendanceRow>
          tableId={`meet/attendance/${meeting.id}`}
          data={[...rows]}
          columns={ATTENDANCE_COLUMNS}
          getRowId={(row) => row.id}
          appearance="embedded"
          viewTabs={false}
          pageSize={0}
          density="condensed"
          searchText={(row) => `${row.name} ${KIND_LABEL[row.kind]}`}
          toolbar={{ searchPlaceholder: "Search attendees" }}
          detail={{ enabled: false }}
          copy={ATTENDANCE_COPY}
          rowClassName={(row) =>
            row.joinedAt === null ? "text-muted-foreground" : undefined
          }
        />
      </div>
    </div>
  );
}
