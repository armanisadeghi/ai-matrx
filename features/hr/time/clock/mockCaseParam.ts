/**
 * features/hr/time/clock/mockCaseParam.ts — `?case=edge` on a mock-lane surface.
 *
 * The four-case fixture discipline (happy · empty · error · edge) only pays for itself if the ugly
 * cases can actually be **looked at**. The `edge` fixtures in this lane are the expensive-to-discover
 * ones — the idempotent replay that must render as a success, the `blocked` clock state with a door,
 * the revoked device, the duplicate-suspected card — and a build that can only render `happy` has
 * not been checked against any of them.
 *
 * 🚨 **INERT UNLESS `NEXT_PUBLIC_HR_MOCK=1`.** The selector is read only where the mock transport is
 * already answering; with the flag off this returns `undefined` and the query parameter does
 * nothing at all. A URL parameter that could steer a *live* surface into a fixture would be a
 * production defect, so the flag check is here, at the single point of parsing, rather than trusted
 * to each call site.
 */

import { HR_MOCK_ENABLED, type HrFixtureCase } from "@/features/hr/mock/transport";

const CASES: ReadonlySet<string> = new Set(["happy", "empty", "error", "edge"]);

export function mockCaseFromParam(value: string | string[] | undefined): HrFixtureCase | undefined {
  if (!HR_MOCK_ENABLED) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !CASES.has(raw)) return undefined;
  return raw as HrFixtureCase;
}

/**
 * A stand-in subject for `/hr/me/clock`, so the widget's eight states can actually be **looked at**.
 *
 * 🚨 **INERT UNLESS `NEXT_PUBLIC_HR_MOCK=1`** — the same single gate as {@link mockCaseFromParam}.
 * With the flag off this returns `undefined` and the parameter does nothing, so it can never be used
 * to point a live surface at somebody else's employment. The real subject is always
 * `hr_my_context`'s `active.employment_id`.
 *
 * Why it is needed at all: the platform's own test administrator is not an *employee* of any
 * organisation — `active.employment_id` is legitimately `null` for them, and route 6 correctly
 * renders "you do not have an active job here today" instead of a clock. That is the right product
 * behaviour and the wrong verification behaviour: without a subject the widget never mounts, and the
 * `blocked` / `offline` / replay states nobody wants to discover in production stay unlooked-at.
 * D15's independent verifier has the same problem, and this is what lets them do the pass.
 */
export function mockEmploymentIdFromParam(
  value: string | string[] | undefined,
): string | undefined {
  if (!HR_MOCK_ENABLED) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() !== "" ? raw : undefined;
}
