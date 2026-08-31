"use client";

/**
 * THE ATTENDANCE EXCEPTION'S ACTIONS — ONE definition of what a right-clicked
 * `hr.attendance_exception` row offers, shared by every surface that renders
 * one: `ExceptionsQueue` (route 31), `ExceptionsStrip` (routes 28/29's
 * inline strip), `PeriodApprovalGrid`, and `ExceptionDoor`.
 *
 * Only the universal door + a same-day quick "Acknowledge" live here.
 * `excused` / `disputed` / every other resolution needs its own reason
 * dialog (`ExceptionResolveControls` — see route 31's own header note on why
 * that stays a loop of single resolutions, never a bulk RPC) and stays out
 * of this generic module rather than threading a resolve-dialog opener
 * through every consumer; a future adopter with the dialog already mounted
 * can grow this the same way `pageMenuSection` grew `onDismiss`/`onRestore`.
 *
 * 🚨 NO NEW READ OR WRITE PATH LIVES HERE. "Open timesheet" is an existing
 * route; "Acknowledge" calls the same `hr.attendance_exception_resolve` RPC
 * the row's own controls call, with the identical arguments the bulk dialog
 * uses for this one resolution.
 */

import { Check, ExternalLink } from "lucide-react";

import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import { hrTimesheetHref, type HrOrgRef } from "@/features/hr/routes";

export interface AttendanceExceptionMenuRow {
  id: string;
  employmentId: string;
  employeeDisplayName: string | null;
  allowedResolutions: string[];
}

/** There is no separate "exception row" record — this IS the `hr.attendance_exception` row. */
export function attendanceExceptionEntityRef(
  row: AttendanceExceptionMenuRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return {
    type: "hr_attendance_exception",
    id: row.id,
    title: row.employeeDisplayName ?? "This employee",
  };
}

export function attendanceExceptionMenuSection(
  row: AttendanceExceptionMenuRow | null,
  orgRef: HrOrgRef,
  opts?: {
    /** Absent (not disabled) when the surface is read-only or resolve is not wired here. */
    onAcknowledge?: (row: AttendanceExceptionMenuRow) => void;
  },
): ContextMenuExtraSection {
  const items: ContextMenuExtraItem[] = [
    {
      kind: "link",
      id: "exception-open-timesheet",
      label: "Open timesheet",
      icon: ExternalLink,
      href: row ? hrTimesheetHref(row.employmentId, orgRef) : "#",
      disabled: !row,
    },
  ];
  if (opts?.onAcknowledge && row?.allowedResolutions.includes("acknowledged"))
    items.push({
      kind: "item",
      id: "exception-acknowledge",
      label: "Acknowledge",
      icon: Check,
      onSelect: () => opts.onAcknowledge?.(row),
    });
  return { id: "hr-exception", label: "This exception", items };
}
