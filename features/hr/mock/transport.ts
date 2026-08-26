/**
 * features/hr/mock/transport.ts — SPEC-CONTRACTS §6.3 step 3.
 *
 * *"Serve the mocks from the stub behind a `NEXT_PUBLIC_HR_MOCK=1` flag that swaps the typed
 * client's transport for the fixture loader. Nothing else in client code changes."*
 *
 * WHY THIS EXISTS
 * ---------------
 * No HR or e-sign router exists in aidream (verified 2026-08-26). The client lanes fan out at G1
 * and must not wait for the server lanes, so they build against `aidream/hr-contracts.openapi.json`
 * — the hand-written stub — with this transport answering from the §6.4 fixture set.
 *
 * WHAT IT IS NOT
 * --------------
 * It is not a fake server and it does not simulate behaviour. It returns the fixture for the case
 * you asked for, verbatim. Business logic in a mock is how a UI ends up built against a fiction
 * that no real endpoint ever produced.
 *
 * CUTOVER (§6.3 step 4)
 * ---------------------
 * When a family lands for real in aidream, its stub entries are deleted, `/schema/all` takes over,
 * and this lane goes with it — per family, not all at once. If the real server's generated types
 * differ from the stub the build goes red, and THAT RED BUILD IS THE CONTRACT-DRIFT DETECTOR.
 */

import {
  HR_FIXTURES,
  HR_OPERATION_IDS,
  type HrFixture,
  type HrFixtureCase,
  type HrOperationId,
} from "../__fixtures__/registry.generated";

export type { HrFixture, HrFixtureCase, HrOperationId };
export { HR_OPERATION_IDS };

/**
 * The flag is read in exactly ONE place. SPEC-CONTRACTS §6.3 names this variable, so it is spelled
 * as the frozen spec spells it; the platform's env-vars-are-values-not-toggles rule is satisfied by
 * there being a single read and no `??` fallback chain.
 */
export const HR_MOCK_ENABLED = process.env.NEXT_PUBLIC_HR_MOCK === "1";

/** Which case the mock should serve. Defaults to `happy`. */
export type HrMockCaseSelector = HrFixtureCase | undefined;

export interface HrMockResponse {
  status: number;
  body: unknown;
  fixture: HrFixture;
}

/** Every operation in the frozen catalog, indexed by `METHOD path-template`. */
const BY_ROUTE = new Map<string, HrOperationId>();
for (const key of Object.keys(HR_FIXTURES)) {
  const fx = HR_FIXTURES[key];
  BY_ROUTE.set(`${fx.__fixture.method} ${fx.__fixture.path}`, fx.__fixture.operation_id as HrOperationId);
}

/** Resolve a concrete request URL back to its path TEMPLATE (`/hr/exports/{export_id}`). */
export function resolveOperation(method: string, path: string): HrOperationId | null {
  const m = method.toUpperCase();
  const clean = path.split("?")[0];
  const direct = BY_ROUTE.get(`${m} ${clean}`);
  if (direct) return direct;

  const segments = clean.split("/");
  for (const [route, opId] of BY_ROUTE) {
    const [routeMethod, template] = route.split(" ");
    if (routeMethod !== m) continue;
    const parts = template.split("/");
    if (parts.length !== segments.length) continue;
    const matches = parts.every(
      (part, i) => (part.startsWith("{") && part.endsWith("}")) || part === segments[i],
    );
    if (matches) return opId;
  }
  return null;
}

export function getFixture(
  operationId: HrOperationId,
  fixtureCase: HrFixtureCase = "happy",
): HrFixture | null {
  return HR_FIXTURES[`${operationId}.${fixtureCase}`] ?? null;
}

/**
 * Answer one request from the fixture set, or return `null` when this is not a mocked HR route.
 * `null` means "not mine" — the caller falls through to the real transport, so turning the flag on
 * cannot silently swallow a non-HR call.
 */
export function serveFromFixtures(
  method: string,
  path: string,
  fixtureCase: HrMockCaseSelector = "happy",
): HrMockResponse | null {
  const operationId = resolveOperation(method, path);
  if (!operationId) return null;
  const fixture = getFixture(operationId, fixtureCase ?? "happy");
  if (!fixture) {
    throw new Error(
      `[hr-mock] ${operationId} has no "${fixtureCase}" fixture. §6.4 requires four cases per ` +
        `endpoint — re-run scripts/hr/generate_hr_fixtures.py rather than adding one by hand.`,
    );
  }
  return { status: fixture.__fixture.status, body: fixture.body, fixture };
}
