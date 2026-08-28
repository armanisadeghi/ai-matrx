/**
 * features/hr/leave/manager/routes.ts — the leave DESK's URL doors.
 *
 * ♻️ THESE BELONG IN `features/hr/routes.ts` beside `hrLeaveHref`, and should move there the
 * next time a session owns that file — the same note, and the same reason, as
 * `features/hr/leave/hrefs.ts`. This build owns `features/hr/leave/**` and nothing else, and
 * `routes.ts` is edited by other lanes concurrently.
 *
 * 🚨 EVERY DOOR CARRIES `?org=`. SPEC-UI-IA §1 resolves the active employer from `?org=` FIRST,
 * before the user's active-org selection — so a link that drops it can silently land the person
 * in a different employer. HR is strictly single-employer, which makes that a compliance
 * defect, not a cosmetic one.
 *
 * 🚨 AND THAT IS WHY `hr.leave_balances`' OWN `ledger_href` IS NOT USED AS A LINK.
 * The door returns `/hr/leave/balances/<employment>/<policy>` — correct as a path and wrong as
 * an href from this app, because it carries no employer. `leaveLedgerHrefFrom` takes the
 * server's path for its IDS and re-attaches the employer here.
 */

import { HR_ORG_PARAM } from "@/features/hr/constants";

/** A slug or a uuid. Null/undefined means "carry no employer". */
export type HrOrgRef = string | null | undefined;

type QueryValue = string | number | boolean | null | undefined;

function leaveUrl(
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

/** Route 42 — the decision surface. `scope` and `request` are its two deep-link params. */
export function leaveQueueHref(
  org?: HrOrgRef,
  options: { scope?: string | null; request?: string | null } = {},
): string {
  return leaveUrl("/hr/leave", org, {
    scope: options.scope,
    request: options.request,
  });
}

/** Route 44 — the balance list. */
export function leaveBalancesHref(
  org?: HrOrgRef,
  options: { scope?: string | null; policy?: string | null; negative?: boolean } = {},
): string {
  return leaveUrl("/hr/leave/balances", org, {
    scope: options.scope,
    policy: options.policy,
    negative: options.negative ? "1" : null,
  });
}

/** Route 44a — the §12 ledger audit view for one employment on one policy. */
export function leaveLedgerHref(
  employmentId: string,
  leavePolicyId: string,
  org?: HrOrgRef,
  options: { asOf?: string | null; show?: string | null } = {},
): string {
  return leaveUrl(
    `/hr/leave/balances/${encodeURIComponent(employmentId)}/${encodeURIComponent(leavePolicyId)}`,
    org,
    { as_of: options.asOf, show: options.show },
  );
}

/**
 * The same door, built from the server's own `ledger_href`.
 *
 * Returns `null` when the path is not the shape we expect, rather than guessing: a half-built
 * link to somebody's ledger is worse than no link, because the reader cannot tell it is wrong.
 */
export function leaveLedgerHrefFrom(
  serverPath: string | null,
  org?: HrOrgRef,
): string | null {
  if (!serverPath) return null;
  const match = /^\/hr\/leave\/balances\/([^/?#]+)\/([^/?#]+)$/.exec(serverPath.split("?")[0]);
  if (!match) return null;
  return leaveLedgerHref(match[1], match[2], org);
}

/** Route 43 — the who's-out calendar. `on` anchors the month/week; `view` picks which. */
export function leaveCalendarHref(
  org?: HrOrgRef,
  options: { on?: string | null; view?: "month" | "week" | null } = {},
): string {
  return leaveUrl("/hr/leave/calendar", org, { on: options.on, view: options.view });
}

/**
 * Route 74a — the policy editor. `new` is the create door: `hr_leave_policy_save` takes a
 * payload with no `id` and inserts, so the editor needs no second route to create one.
 */
export function leavePolicyHref(
  policyId: string,
  org?: HrOrgRef,
  options: { focus?: string | null } = {},
): string {
  return leaveUrl(
    `/hr/settings/leave-policies/${encodeURIComponent(policyId)}`,
    org,
    { focus: options.focus },
  );
}

/** Route 74b — who is on this policy. The enrolled headcount on route 74 opens this. */
export function leavePolicyEnrollmentHref(policyId: string, org?: HrOrgRef): string {
  return leaveUrl(
    `/hr/settings/leave-policies/${encodeURIComponent(policyId)}/enrollment`,
    org,
  );
}

/** The literal `[policyId]` value that means "author a new one". */
export const LEAVE_POLICY_NEW = "new";
