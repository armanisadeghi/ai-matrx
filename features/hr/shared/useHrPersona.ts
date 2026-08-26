// features/hr/shared/useHrPersona.ts
//
// THE PERSONA + CAPABILITY HOOK — the ONE place a surface asks "may this person?".
//
// 🚨 NAV AND ACTION VISIBILITY ARE CAPABILITY-DRIVEN, NEVER ROLE-STRING-DRIVEN
// (SPEC-UI-IA §2.2). A custom Access Level that grants timesheet approval without
// full HR admin must get the Time item WITHOUT inheriting the rest. So:
//
//     ✅  const { can } = useHrPersona();  if (can("comp.read")) …
//     ❌  if (persona === "hr_admin") …
//
// The persona exists to pick a LABEL and a self-scoped destination ("My Timesheet"
// → `/hr/me/timesheet`), never to decide access. Every `persona === …` test that
// gates content instead of wording is a review failure.
//
// Employee self-service is not a separate app. It is the same nav with self-scoped
// labels; a promoted employee gains items and nothing re-mounts or re-brands.

"use client";

import type { HrCapability, HrPersona } from "../constants";
import type { HrCapabilitySet } from "../types";
import { useHrContext } from "./useHrContext";

export type HrPersonaValue = HrCapabilitySet & {
  /** null until an employer resolves — render nothing persona-specific before that. */
  persona: HrPersona | null;
  /** The org membership role. HR reads it for the module-off enable door ONLY. */
  orgRole: string | null;
  /** This person's own employee record here, when they have one. */
  employeeId: string | null;
  /**
   * Their active spell TODAY. A self-service nav item whose surface needs a spell
   * is ABSENT when this is null (SPEC-EMPLOYEES §2.1) — never rendered-then-empty.
   */
  employmentId: string | null;
  isLoading: boolean;
};

/** Pure — so nav resolution can be unit-tested without a React tree. */
export function makeCapabilitySet(capabilities: string[]): HrCapabilitySet {
  const set = new Set(capabilities);
  return {
    can: (capability: HrCapability) => set.has(capability),
    all: capabilities,
  };
}

export function useHrPersona(): HrPersonaValue {
  const { active, persona, capabilities, isLoading } = useHrContext();
  const { can, all } = makeCapabilitySet(capabilities);

  return {
    persona,
    can,
    all,
    orgRole: active?.org_role ?? null,
    employeeId: active?.employee_id ?? null,
    employmentId: active?.employment_id ?? null,
    isLoading,
  };
}

/** Owner/admin of the org — the ONE standing that opens the module-enable door. */
export function isOrgSteward(orgRole: string | null): boolean {
  return orgRole === "owner" || orgRole === "admin";
}
