// features/hr/settings/activation/useHrActivationState.ts
//
// 🚨 THE SINGLE SOURCE FOR "IS THIS EMPLOYER GOING YET?".
//
// `/hr` (lane L9) and every `/hr/settings/*` route render the same activation
// surface, and L9 MUST NOT re-derive the state — two derivations of one gate is how
// the home page and the settings page end up disagreeing about whether an org is set
// up. Everything either surface needs comes out of this hook.
//
// ── THE GATE, AND WHY IT IS NOT "ZERO EMPLOYEES" ────────────────────────────
//
// The wizard shows when there is NO `hr.employer_profile` row — `is_activated ===
// false`. That is the same condition `hr_activate_employer` itself refuses on: it
// returns `already_activated` the moment ANY `hr_owner` role assignment exists, live
// or historical (read out of the function body 2026-08-26).
//
// So an org that HAS a profile but no employees is NOT a wizard candidate — running
// the wizard there would be refused, and a wizard that cannot succeed is a dead end
// wearing a form. That org gets the FIRST-HIRE DOOR to `/hr/people/new` instead.
//
// R-L1 U5 — SPEC-EMPLOYEES §2.4 keys the wizard off the missing employer profile
// while SPEC-DOMAIN-WIDE §1.5 keys it off an empty org; they disagree, and this is
// the resolution. Recorded here because the next agent will hit the same fork.

"use client";

import { useHrContext } from "../../shared/useHrContext";
import { hrPeopleNewHref, hrSettingsHref } from "../../routes";
import type { HrActivationMode } from "../types";

export type HrActivationState = {
  /** `wizard` · `first_hire` · `ready`. Null while the employer context resolves. */
  mode: HrActivationMode | null;
  /** The resolved employer, or null → the caller renders the employer picker. */
  organizationId: string | null;
  /** What to put in `?org=` on links out of the wizard. */
  orgRef: string | null;
  /**
   * Org owner/admin AND no `hr_owner` assignment yet — the ONE gate on the wizard's
   * commit step, straight off `hr_my_context().active.can_activate`. Never a role
   * string test in a component.
   */
  canActivate: boolean;
  /** True when HR is on but nothing has been created — the wizard's own condition. */
  needsActivation: boolean;
  employeeCount: number;
  /** The door the `first_hire` mode points at. */
  firstHireHref: string;
  /** Where the wizard sends a person whose org already has a profile. */
  settingsHref: string;
  isLoading: boolean;
  /** Re-resolve the employer context after a successful activation. */
  refresh: () => void;
};

/**
 * @param organizationId The employer to answer for. Pass the resolved id from
 *   `useHrContext()`; passing null answers for whatever employer is resolved, which
 *   is what `/hr` wants. A MISMATCH (an id that is not the resolved employer) yields
 *   `mode: null` rather than a confident answer about the wrong org.
 */
export function useHrActivationState(
  organizationId?: string | null,
): HrActivationState {
  const context = useHrContext();
  const active = context.active;
  const orgRef = context.orgRef;
  const resolvedId = active?.organization_id ?? null;
  const asked = organizationId ?? resolvedId;

  const base = {
    organizationId: resolvedId,
    orgRef,
    canActivate: active?.can_activate ?? false,
    employeeCount: active?.employee_count ?? 0,
    firstHireHref: hrPeopleNewHref({ org: orgRef }),
    settingsHref: hrSettingsHref("employer", { org: orgRef }),
    isLoading: context.isLoading,
    refresh: context.refresh,
  };

  if (context.isLoading || !active) {
    return { ...base, mode: null, needsActivation: false };
  }
  // Answering about an employer we did not resolve would be a guess, and a guess
  // here decides whether somebody sees a setup wizard for the wrong company.
  if (asked !== null && asked !== resolvedId) {
    return { ...base, mode: null, needsActivation: false };
  }
  // The module being off is its own state (`HrModuleOff`), upstream of activation.
  if (!active.module_enabled) {
    return { ...base, mode: null, needsActivation: false };
  }

  if (!active.is_activated) {
    return { ...base, mode: "wizard", needsActivation: true };
  }
  if (active.employee_count === 0) {
    return { ...base, mode: "first_hire", needsActivation: false };
  }
  return { ...base, mode: "ready", needsActivation: false };
}
