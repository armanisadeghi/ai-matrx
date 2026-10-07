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

import { toDelimitedText } from "@ai-matrx/alchemy/operate/read";
import type { PunchRow } from "../api/types";
import { formatStampedTimeWithZone } from "../shared/format";
import {
  ACTOR_TYPE_LABELS,
  PUNCH_KIND_LABELS,
  PUNCH_SOURCE_LABELS,
} from "../shared/vocabulary";
import { downloadFile } from "@ai-matrx/kit/download";

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

/**
 * @param names employmentId → display name. The register's rows carry no name of their own, and an
 *              evidence file identified only by uuid is not evidence anybody can read.
 */
export function punchRegisterToCsv(
  rows: PunchRow[],
  names: Record<string, string | undefined>,
): string {
  return toDelimitedText(
    HEADERS,
    rows.map((punch) =>
      [
        names[punch.employmentId] ?? punch.employmentId,
        punch.localWorkDate,
        formatStampedTimeWithZone(punch.occurredAt, punch.tz),
        punch.tz,
        PUNCH_KIND_LABELS[punch.punchKind],
        PUNCH_SOURCE_LABELS[punch.source],
        ACTOR_TYPE_LABELS[punch.actorType],
        punch.actorNote,
        punch.jurisdictionKey,
        punch.deviceReportedAt,
        punch.clockSkewAppliedSeconds,
        punch.hasGeo ? "yes" : "no",
        punch.hasPhoto ? "yes" : "no",
        punch.voidedAt,
        punch.voidedReason,
        punch.voidedByPunchId,
        punch.enteredReason,
        punch.id,
      ],
    ),
    { spreadsheetSafe: true },
  );
}

/** Hand the file to the browser. No server round trip — the rows are already on screen. */
export function downloadPunchRegisterCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadFile(filename, blob, blob.type);
}
