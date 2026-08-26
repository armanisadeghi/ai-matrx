"use client";

/**
 * features/hr/time/punches/registerCsv.ts — the filtered register as evidence (L3-60, §2.5).
 *
 * 🚨 **THE ACTOR AND JURISDICTION COLUMNS STAY INTACT.** L3-60 names them because they are the two
 * that make this file evidence rather than a spreadsheet: *who* recorded the punch (the employee, a
 * kiosk device, a manager, an automation) and *under which jurisdiction* it was stamped. A register
 * export missing those answers no question anybody exports a register to answer.
 *
 * 🚨 **NO COMPUTED VALUE IS EXPORTED.** Same law as the page it comes from — no interval, no
 * rounded figure, no total. The export is the raw lane in a file.
 *
 * 🚨 **VOIDS ARE EXPORTED.** The void columns ride along, because a register that silently drops
 * voided rows is the destroyed record §2.5 warns about, transferred to a file where nobody can see
 * what is missing.
 *
 * 🚨 `sourceIp` IS **NOT** A COLUMN. §4.7's privacy posture puts it behind punch-edit authority or
 * self-ownership; a CSV is the definition of a list a peer can see.
 */

import type { PunchRow } from "../api/types";
import { formatStampedTimeWithZone } from "../shared/format";
import {
  ACTOR_TYPE_LABELS,
  PUNCH_KIND_LABELS,
  PUNCH_SOURCE_LABELS,
} from "../shared/vocabulary";

const HEADERS = [
  "Employee",
  "Local work date",
  "Occurred at",
  "Time zone",
  "Punch",
  "Source",
  "Actor",
  "Actor note",
  "Jurisdiction",
  "Device reported at",
  "Clock skew applied (seconds)",
  "Location captured",
  "Photo captured",
  "Voided at",
  "Voided reason",
  "Voided by punch",
  "Entered reason",
  "Punch id",
] as const;

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * @param names employmentId → display name. The register's rows carry no name of their own, and an
 *              evidence file identified only by uuid is not evidence anybody can read.
 */
export function punchRegisterToCsv(
  rows: PunchRow[],
  names: Record<string, string | undefined>,
): string {
  const lines = [HEADERS.join(",")];
  for (const punch of rows) {
    lines.push(
      [
        cell(names[punch.employmentId] ?? punch.employmentId),
        cell(punch.localWorkDate),
        cell(formatStampedTimeWithZone(punch.occurredAt, punch.tz)),
        cell(punch.tz),
        cell(PUNCH_KIND_LABELS[punch.punchKind]),
        cell(PUNCH_SOURCE_LABELS[punch.source]),
        cell(ACTOR_TYPE_LABELS[punch.actorType]),
        cell(punch.actorNote),
        cell(punch.jurisdictionKey),
        cell(punch.deviceReportedAt),
        cell(punch.clockSkewAppliedSeconds),
        cell(punch.hasGeo ? "yes" : "no"),
        cell(punch.hasPhoto ? "yes" : "no"),
        cell(punch.voidedAt),
        cell(punch.voidedReason),
        cell(punch.voidedByPunchId),
        cell(punch.enteredReason),
        cell(punch.id),
      ].join(","),
    );
  }
  return lines.join("\n");
}

/** Hand the file to the browser. No server round trip — the rows are already on screen. */
export function downloadPunchRegisterCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
