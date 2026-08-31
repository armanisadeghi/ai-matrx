"use client";

/**
 * features/hr/people/hr-person-menu.tsx — the right-click menu for a person,
 * shared by every surface that renders one as a row. `HrDirectoryRow` (the
 * one people list) and `LeaveBalanceRow` (a policy's enrolment roster) are
 * different shapes for the same identity, so each gets a small adapter that
 * produces the one `HrPersonMenuTarget` the section renders from — the
 * pattern `features/crm/components/crm-row-actions.tsx` uses for CRM rows.
 *
 * Registered in `features/context-menu-v3/SECTIONS.md`. Consumers today:
 * `LeaveEnrollmentSurface` (roster + candidates). Future adopters (same
 * identity, not yet touched by this rollout): `HrDirectory`,
 * `HrDirectoryCards`, `directoryColumns`, `EmploymentPicker`,
 * `LeaveDecisionDialogs`.
 *
 * No new write path — the only door is the existing profile / ledger route.
 */

import { ExternalLink, Pencil } from "lucide-react";

import type {
  ContextMenuEntityRef,
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import { hrEmployeeHref, type HrOrgRef } from "@/features/hr/routes";
import type { HrDirectoryRow } from "@/features/hr/types";
import { leaveLedgerHrefFrom } from "../leave/manager/routes";
import type { LeaveBalanceRow } from "../leave/manager/api/types";

export interface HrPersonMenuTarget {
  id: string;
  name: string;
  /** Already resolved by the adapter — a profile door or a ledger door. */
  href: string | null;
  jobTitle?: string | null;
  department?: string | null;
}

/** There is no separate "person row" record — this IS the `hr.employee` row. */
export function hrPersonEntityRef(
  target: HrPersonMenuTarget | null,
): ContextMenuEntityRef | null {
  if (!target) return null;
  return { type: "hr_employee", id: target.id, title: target.name };
}

export function hrPersonMenuContent(target: HrPersonMenuTarget | null): string {
  if (!target) return "";
  return [target.name, target.jobTitle ?? "", target.department ?? ""]
    .filter(Boolean)
    .join("\n");
}

/** Adapter: the directory's row shape (also the leave-enrollment candidate list). */
export function hrDirectoryRowTarget(
  row: HrDirectoryRow,
  orgRef: HrOrgRef,
): HrPersonMenuTarget {
  return {
    id: row.employee_id,
    name: row.display_name,
    href: hrEmployeeHref(row.employee_id, null, { org: orgRef }),
    jobTitle: row.job_title ?? null,
    department: row.department ?? null,
  };
}

/** Adapter: a leave policy's enrolment roster row. */
export function leaveBalanceRowTarget(
  row: LeaveBalanceRow,
  orgRef: HrOrgRef,
): HrPersonMenuTarget {
  return {
    id: row.employmentId ?? "unknown",
    name: row.employeeName ?? "Not provided",
    href: leaveLedgerHrefFrom(row.ledgerHref, orgRef),
  };
}

export function hrPersonMenuSection(
  target: HrPersonMenuTarget | null,
  opts?: {
    /** LeaveBalancesSurface only — absent (not disabled) when the caller cannot adjust. */
    onAdjustBalance?: () => void;
  },
): ContextMenuExtraSection {
  const items: ContextMenuExtraItem[] = [
    {
      kind: "link",
      id: "hr-person-open",
      label: "Open profile",
      icon: ExternalLink,
      href: target?.href ?? "#",
      disabled: !target || !target.href,
      description: !target
        ? "Right-click a person to open them"
        : !target.href
          ? "No door provided for this row"
          : undefined,
    },
  ];
  if (opts?.onAdjustBalance)
    items.push({
      kind: "item",
      id: "hr-person-adjust-balance",
      label: "Adjust balance…",
      icon: Pencil,
      onSelect: opts.onAdjustBalance,
    });

  return { id: "hr-person", label: "This person", anchor: "after-compare", items };
}
