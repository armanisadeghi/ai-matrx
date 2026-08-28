/**
 * features/hr/leave/hrefs.ts — the leave lane's URL doors.
 *
 * ♻️ THIS BELONGS IN `features/hr/routes.ts` AND SHOULD MOVE THERE. It lives here only
 * because this build owns `features/hr/leave/**` and nothing else; `routes.ts` is edited by
 * other lanes concurrently. Whoever next owns `routes.ts` should lift
 * `hrMeTimeOffPolicyHref` into it beside `hrMeTimeOffHref` and delete this file.
 *
 * 🚨 WHY THIS EXISTS AT ALL RATHER THAN USING THE SERVER'S `ledger_href`.
 * `hr.my_time_off` returns `ledger_href = '/hr/me/time-off/<policyId>'` — correct as a path
 * and WRONG as a link from this app, because it carries no `?org=`. SPEC-UI-IA §1 resolves
 * the active employer from `?org=` FIRST, so a link that drops it can silently land the
 * person in a different employer — and HR is strictly single-employer, which makes that a
 * compliance defect, not a cosmetic one. So the server's path is used for its POLICY ID and
 * the employer is re-attached here, the same way `routes.ts` does it.
 */

import { HR_ORG_PARAM } from "@/features/hr/constants";

/** A slug or a uuid. Null/undefined means "carry no employer". */
export type HrOrgRef = string | null | undefined;

/**
 * Route 8a (SPEC-LEAVE §12) — the employee's own ledger for one policy, `viewer=self`.
 * The SAME `LeaveLedgerView` component the manager surface renders.
 */
export function hrMeTimeOffPolicyHref(policyId: string, org?: HrOrgRef): string {
  const orgRef = typeof org === "string" ? org.trim() : "";
  const path = `/hr/me/time-off/${encodeURIComponent(policyId)}`;
  return orgRef ? `${path}?${HR_ORG_PARAM}=${encodeURIComponent(orgRef)}` : path;
}
