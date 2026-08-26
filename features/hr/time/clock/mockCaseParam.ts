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
