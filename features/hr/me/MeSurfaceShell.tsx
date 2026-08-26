// features/hr/me/MeSurfaceShell.tsx
//
// 🚨 THE SHELL CONTRACT FOR ROUTES 4–9 — the whole of what this lane owes the
// sibling pillar specs (SPEC-EMPLOYEES §2.1).
//
// `/hr/me/documents` · `/timesheet` · `/clock` · `/schedule` · `/time-off` ·
// `/training` belong to Documents & Forms, Time & Attendance, Scheduling,
// Leave & PTO and Training. Their states, validation and flows are theirs. What
// they inherit from here, and must not re-derive:
//
//   1. THE SAME PERSONA RESOLUTION — `useHrPersona()`, capability-driven, never
//      role-string-driven.
//   2. THE SAME EMPLOYER CONTEXT — one `hr_my_context` resolution for the whole
//      `/hr` tree, because HR is strictly single-employer and two surfaces
//      disagreeing about which employer they are showing is a compliance
//      defect, not a render bug.
//   3. THE SAME IDENTITY HEADER as route 2.
//   4. 🚨 `employment_id` RESOLVED THROUGH THE SERVER'S AS-OF RESOLUTION
//      (`hr.employment_as_of(employee_id, current_date)`, delivered as
//      `active.employment_id`) AND **NEVER** THROUGH
//      `hr.employee.current_employment_id`. That column exists so the directory
//      list and the profile header can skip a lateral join. Every number that
//      is money, hours, entitlement or a legal deadline resolves as of the date
//      of the fact (SPEC-DATA-MODEL §4.10).
//   5. 🚨 A PERSONA WITH NO ACTIVE SPELL SEES THE NAV ITEM **ABSENT** — and,
//      because a typed URL still reaches the route, this shell renders the
//      no-access state rather than an empty surface.
//
// ♻️ WHERE A SIBLING SURFACE ALREADY EXISTS, LINK TO IT — never fork it.
// `features/hr/time/` already ships the clock and the timesheet; those routes
// mount those components, not copies of them.

"use client";

import type { ReactNode } from "react";

import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";

export function MeSurfaceShell({
  /** Set false for a surface that genuinely works without a spell (rare). */
  requiresEmployment = true,
  noAccessSentence,
  operation,
  children,
}: {
  requiresEmployment?: boolean;
  noAccessSentence?: string;
  operation: string;
  children: (context: {
    /** The as-of-resolved spell. NEVER `hr.employee.current_employment_id`. */
    employmentId: string;
    employeeId: string | null;
    organizationId: string;
  }) => ReactNode;
}) {
  const { active, isLoading } = useHrContext();
  const employmentId = active?.employment_id ?? null;
  const blocked = requiresEmployment && !employmentId;

  return (
    <HrPageState
      loading={isLoading}
      granted={blocked ? false : undefined}
      operation={operation}
      variant="cards"
      noAccessSentence={
        noAccessSentence ??
        "There is nothing here for you at this employer right now."
      }
    >
      {active && (employmentId || !requiresEmployment)
        ? children({
            employmentId: employmentId ?? "",
            employeeId: active.employee_id,
            organizationId: active.organization_id,
          })
        : null}
    </HrPageState>
  );
}

/**
 * An honest placeholder for a route whose owning lane has not shipped yet.
 *
 * 🚨 THIS IS NOT A "COMING SOON" TOAST. Every promise the product shows a user
 * is registered in `lib/coming-soon/registry.ts` so it can be counted and
 * reviewed like a found defect — see the entries prefixed `hr.me.`. This
 * component renders the registered promise, names the lane that owes it, and
 * gives the person somewhere real to go. A 404 at the end of a nav item the
 * shell itself renders is the dead end this replaces.
 */
export function MePillarPlaceholder({
  title,
  promise,
  owner,
}: {
  title: string;
  promise: string;
  /** The pillar spec that owns this surface. Named, so nobody rebuilds it here. */
  owner: string;
}) {
  return (
    <div className="mx-auto w-full max-w-xl p-4 sm:p-6">
      <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{promise}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          Built by the {owner} part of HR.
        </p>
      </div>
    </div>
  );
}
