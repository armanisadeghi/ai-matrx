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
import { cn } from "@/lib/utils";

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
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1 px-2 text-xs"
          onClick={() =>
            downloadBlob(
              new Blob([attendanceCsv([{ meeting, rows }])], {
                type: "text/csv;charset=utf-8",
              }),
              `${fileSafe(meeting.title)}-attendance.csv`,
            )
          }
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> CSV
        </Button>
      </div>
      {meeting.recurrenceRule ? (
        <p className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          A recurring meeting keeps one attendance list for the whole series:
          each person&apos;s first join and latest leave.
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-2 py-1.5 font-medium">Joined</th>
              <th className="px-2 py-1.5 font-medium">Left</th>
              <th className="px-3 py-1.5 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={row.id}
                className={cn(row.joinedAt === null && "text-muted-foreground")}
              >
                <td className="max-w-0 px-3 py-1.5">
                  <div className="truncate">{row.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {KIND_LABEL[row.kind]}
                    {row.joinedAt === null
                      ? row.admission === "denied"
                        ? " · not let in"
                        : " · never joined"
                      : ""}
                  </div>
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {clock(row.joinedAt)}
                </td>
                <td className="px-2 py-1.5 tabular-nums">
                  {row.leftAt ? clock(row.leftAt) : row.joinedAt ? "at end" : "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {row.durationMs === null
                    ? "—"
                    : formatDurationMs(row.durationMs, { style: "compact" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
