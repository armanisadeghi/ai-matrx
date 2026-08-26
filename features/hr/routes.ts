// features/hr/routes.ts
//
// THE HR MODULE'S URL DOORS. Every `/hr/*` href in the product is built here.
//
// 🚨 NOBODY HAND-ASSEMBLES AN HR URL. Not a template literal in a component, not a
// `?org=` appended by hand. There are two reasons, and both are load-bearing:
//
//  1. **The employer context travels in the URL.** SPEC-UI-IA §1 resolves the active
//     employer from `?org=` FIRST, before the user's active-org selection. A link
//     that drops the param silently lands the user in a different employer — and HR
//     is strictly single-employer, so merging two employers' headcount, timesheets or
//     pay data is a compliance defect, not a cosmetic bug. Passing `org` through
//     every builder is how that cannot happen by accident.
//  2. **`?org=` accepts a SLUG OR A UUID**, matching `organizations/[orgId]`'s own
//     rule. Callers hand us whichever they hold; `useHrContext` resolves it.
//
// Switching employers is a full context change: navigate to the SAME route with the
// new `?org=`, never merge. `hrSwitchEmployerHref` is the one builder for that.
//
// Route numbers in the comments are SPEC-UI-IA §3's; the pillar specs cite them.

import { HR_ORG_PARAM } from "./constants";
import type { HrDirectoryStatus, HrProfileTab, HrWorkerClass } from "./constants";

/** A slug or a uuid. Null/undefined means "carry no employer" (the picker resolves it). */
export type HrOrgRef = string | null | undefined;

export const HR_HREF = "/hr";

type QueryValue = string | number | boolean | null | undefined;

function hrUrl(
  path: string,
  org: HrOrgRef,
  extra?: Record<string, QueryValue>,
): string {
  const params = new URLSearchParams();
  const orgRef = typeof org === "string" ? org.trim() : "";
  if (orgRef) params.set(HR_ORG_PARAM, orgRef);
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

// ── §3.1 Home and self-service ──────────────────────────────────────────────

/** Route 1 — the role-adaptive HR home. */
export function hrHref(org?: HrOrgRef): string {
  return hrUrl(HR_HREF, org);
}

/**
 * Switching employer is a full context change, never a merge (SPEC-UI-IA §1). Give
 * it the CURRENT pathname and the new employer; it rebuilds the same route there.
 */
export function hrSwitchEmployerHref(pathname: string, org: string): string {
  const path = pathname.startsWith(HR_HREF) ? pathname : HR_HREF;
  return hrUrl(path, org);
}

/** Route 2 — My Info. The same `EmployeeProfile` component with `viewer=self`. */
export function hrMeHref(org?: HrOrgRef): string {
  return hrUrl("/hr/me", org);
}
/** Route 3 — my compensation. Never accepts an employeeId; self only. */
export function hrMePayHref(org?: HrOrgRef): string {
  return hrUrl("/hr/me/pay", org);
}
/** Route 4 */
export function hrMeDocumentsHref(org?: HrOrgRef): string {
  return hrUrl("/hr/me/documents", org);
}
/** Route 5 */
export function hrMeTimesheetHref(org?: HrOrgRef): string {
  return hrUrl("/hr/me/timesheet", org);
}
/** Route 6 */
export function hrMeClockHref(org?: HrOrgRef): string {
  return hrUrl("/hr/me/clock", org);
}
/** Route 7 */
export function hrMeScheduleHref(org?: HrOrgRef): string {
  return hrUrl("/hr/me/schedule", org);
}
/** Route 8 */
export function hrMeTimeOffHref(org?: HrOrgRef): string {
  return hrUrl("/hr/me/time-off", org);
}
/** Route 9 */
export function hrMeTrainingHref(org?: HrOrgRef): string {
  return hrUrl("/hr/me/training", org);
}
/** Route 9a — what the platform sent me, and whether it arrived. */
export function hrMeNoticesHref(org?: HrOrgRef): string {
  return hrUrl("/hr/me/notices", org);
}
/** Route 9b — who looked at my confidential records, and under what justification. */
export function hrMeAccessLogHref(org?: HrOrgRef): string {
  return hrUrl("/hr/me/access-log", org);
}

// ── §3.2 People ─────────────────────────────────────────────────────────────

/**
 * Route 10 — the directory. Filters are URL state so a filtered list is a real
 * door somebody can send: `hrPeopleHref({ managerEmployeeId })` is what "12 direct
 * reports" opens (§4.5 — a count is a door).
 */
export function hrPeopleHref(
  options: {
    org?: HrOrgRef;
    search?: string | null;
    status?: HrDirectoryStatus[] | null;
    departmentId?: string | null;
    locationId?: string | null;
    jobTitleId?: string | null;
    workerClass?: HrWorkerClass | null;
    managerEmployeeId?: string | null;
    myTeam?: boolean;
  } = {},
): string {
  return hrUrl("/hr/people", options.org, {
    q: options.search,
    status: options.status?.length ? options.status.join(",") : null,
    department: options.departmentId,
    location: options.locationId,
    title: options.jobTitleId,
    worker_class: options.workerClass,
    manager: options.managerEmployeeId,
    my_team: options.myTeam ? "1" : null,
  });
}

/** Route 11 — the org chart, with the as-of control and an optional focused node. */
export function hrOrgChartHref(
  options: { org?: HrOrgRef; focus?: string | null; asOf?: string | null } = {},
): string {
  return hrUrl("/hr/people/org-chart", options.org, {
    focus: options.focus,
    as_of: options.asOf,
  });
}

/** Route 12 — create an employee, or link an existing member / CRM party / candidate. */
export function hrPeopleNewHref(
  options: {
    org?: HrOrgRef;
    /** Pre-fill from the surface that sent us — never make them retype a name it had. */
    name?: string | null;
    partyId?: string | null;
    userId?: string | null;
    candidateId?: string | null;
  } = {},
): string {
  return hrUrl("/hr/people/new", options.org, {
    name: options.name,
    party: options.partyId,
    user: options.userId,
    candidate: options.candidateId,
  });
}

/**
 * Routes 13/14 — the employee profile. With no tab it redirects to the first tab
 * THIS viewer can see, so a viewer without Personal never lands on a blank page.
 *
 * `assignment` opens one position-assignment row in place (§4.5) and is new-tab-able.
 */
export function hrEmployeeHref(
  employeeId: string,
  tab?: HrProfileTab | string | null,
  options: { org?: HrOrgRef; assignment?: string | null; asOf?: string | null } = {},
): string {
  const base = tab ? `/hr/people/${employeeId}/${tab}` : `/hr/people/${employeeId}`;
  return hrUrl(base, options.org, {
    assignment: options.assignment,
    as_of: options.asOf,
  });
}

/** A custom tab (tier-1 extensibility kit) — `/hr/people/[employeeId]/c/[tabKey]`. */
export function hrEmployeeCustomTabHref(
  employeeId: string,
  tabKey: string,
  org?: HrOrgRef,
): string {
  return hrUrl(`/hr/people/${employeeId}/c/${tabKey}`, org);
}

/** Route 15 — the employee-relations case list. Confidential tier. */
export function hrRelationsHref(org?: HrOrgRef): string {
  return hrUrl("/hr/people/relations", org);
}
/** Route 16 — one case. */
export function hrRelationsCaseHref(caseId: string, org?: HrOrgRef): string {
  return hrUrl(`/hr/people/relations/${caseId}`, org);
}
/** Route 17 — employment / income verification letters. */
export function hrVerificationsHref(org?: HrOrgRef): string {
  return hrUrl("/hr/people/verifications", org);
}

// ── §3.3–§3.10 section roots ────────────────────────────────────────────────
// The pillar lanes own the leaves; these are the nav destinations and the doors
// other surfaces link to. Adding a leaf builder is that lane's edit to this file.

export function hrHiringHref(org?: HrOrgRef): string {
  return hrUrl("/hr/hiring", org);
}
export function hrCandidateHref(candidateId: string, org?: HrOrgRef): string {
  return hrUrl(`/hr/hiring/candidates/${candidateId}`, org);
}
export function hrTimeHref(org?: HrOrgRef): string {
  return hrUrl("/hr/time", org);
}
/** Route 32 — the pay-period state machine per pay group, plus export history. */
export function hrPayPeriodsHref(org?: HrOrgRef): string {
  return hrUrl("/hr/time/periods", org);
}
/** Route 33 — one pay period: approval progress and its export runs. */
export function hrPayPeriodHref(periodId: string, org?: HrOrgRef): string {
  return hrUrl(`/hr/time/periods/${periodId}`, org);
}
export function hrScheduleHref(org?: HrOrgRef): string {
  return hrUrl("/hr/schedule", org);
}
export function hrLeaveHref(org?: HrOrgRef): string {
  return hrUrl("/hr/leave", org);
}
export function hrOnboardingHref(org?: HrOrgRef): string {
  return hrUrl("/hr/onboarding", org);
}
export function hrDocumentsHref(org?: HrOrgRef): string {
  return hrUrl("/hr/documents", org);
}
export function hrTrainingHref(org?: HrOrgRef): string {
  return hrUrl("/hr/training", org);
}
export function hrPerformanceHref(org?: HrOrgRef): string {
  return hrUrl("/hr/performance", org);
}
export function hrAssetsHref(org?: HrOrgRef): string {
  return hrUrl("/hr/assets", org);
}
export function hrEngagementHref(org?: HrOrgRef): string {
  return hrUrl("/hr/engagement", org);
}
export function hrComplianceHref(org?: HrOrgRef): string {
  return hrUrl("/hr/compliance", org);
}
/** Route 65 — THE one HR task inbox. HR never builds a second task store. */
export function hrTasksHref(org?: HrOrgRef): string {
  return hrUrl("/hr/tasks", org);
}
export function hrReportsHref(org?: HrOrgRef): string {
  return hrUrl("/hr/reports", org);
}

// ── §3.11 Org HR settings ───────────────────────────────────────────────────

/** The settings sections, in the order their route tabs render. */
export const HR_SETTINGS_SECTIONS = [
  "employer",
  "structure",
  "pay-groups",
  "calendars",
  "codes",
  "fields",
  "leave-policies",
  "time-rules",
  "devices",
  "schedule-rules",
  "access",
  "workflows",
  "notifications",
  "alerts",
  "ai",
  "retention",
  "exit-surveys",
] as const;
export type HrSettingsSection = (typeof HR_SETTINGS_SECTIONS)[number];

/**
 * Route 67 (hub) and 68–81b (sections). With no section this is the searchable
 * index of every configuration key with its effective value and its origin.
 */
export function hrSettingsHref(
  section?: HrSettingsSection | null,
  options: { org?: HrOrgRef; focus?: string | null } = {},
): string {
  const base = section ? `/hr/settings/${section}` : "/hr/settings";
  return hrUrl(base, options.org, { focus: options.focus });
}

/** §4.5 — Department · Location · Job title all open the structure panel, focused. */
export function hrStructureFocusHref(focusId: string, org?: HrOrgRef): string {
  return hrSettingsHref("structure", { org, focus: focusId });
}

// ── Doors OUT of HR, into surfaces HR does not own (§4.5) ───────────────────
// Built here so the profile never hand-assembles a foreign URL either.

/** The CRM party this employee is 1:1 with. */
export function hrPartyHref(partyId: string): string {
  return `/crm/${partyId}`;
}

/** The linked org member / auth user. An employee is NOT required to have a login. */
export function hrOrgMemberHref(orgSlugOrId: string, userId: string): string {
  return `/organizations/${orgSlugOrId}/admin/users/${userId}`;
}

/** The org-workspace door (route 94) — its primary action comes back to `/hr?org=`. */
export function hrOrgWorkspaceHref(orgSlugOrId: string): string {
  return `/organizations/${orgSlugOrId}/hr`;
}

/** The org settings People section (route 93) — the module toggle lives there. */
export function hrOrgSettingsPeopleHref(orgSlugOrId: string): string {
  return `/organizations/${orgSlugOrId}/settings#people`;
}
