/**
 * THE PERIOD-GRID ROW'S ENTITY + READABLE CONTENT — one definition of "an
 * employment's timecard within a pay period" (`hr_pay_period_employment`),
 * shared by every surface that names one.
 *
 * Today: `PeriodApprovalGrid` (the approval table). `BulkApproveDialog`'s
 * eligible/excluded confirmation lists render the same `PeriodGridRow`
 * identity and are a future adopter if that static preview ever grows its
 * own right-click menu — see the registry note in
 * `features/context-menu-v3/SECTIONS.md`.
 *
 * No shared row-actions hook here (yet): the confirmation dialog is a static
 * preview list, not a browsable pane, so this stays the identity's entity ref
 * + readable text.
 */

import type { ContextMenuEntityRef } from "@/features/context-menu-v3/types";
import type { PeriodGridRow } from "../api/types";

export function periodGridRowEntityRef(
  row: PeriodGridRow | null,
): ContextMenuEntityRef | null {
  if (!row) return null;
  return {
    type: "hr_pay_period_employment",
    id: row.employmentId,
    title: row.employeeDisplayName,
  };
}

export function periodGridRowContent(row: PeriodGridRow): string {
  return [
    `${row.employeeDisplayName} (${row.employeeNumber ?? "no number"})`,
    `state=${row.state} total_hours=${row.totalHours} overtime=${row.hoursOvertime}`,
    row.openExceptionCount > 0
      ? `${row.openExceptionCount} open exception(s)`
      : "No open exceptions",
    row.hasDispute ? "Employee disagrees with hours" : null,
  ]
    .filter(Boolean)
    .join("\n");
}
