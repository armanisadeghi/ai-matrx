/**
 * lib/api/hr-contract-client.ts
 *
 * The contract-bound client for the HR + e-sign engine seams (SPEC-CONTRACTS §3 and §5), typed
 * against `aidream/hr-contracts.openapi.json` — the hand-written stub of §6.3 — rather than
 * against the live `/schema/all` output, because NO HR OR E-SIGN ROUTER EXISTS IN AIDREAM YET
 * (verified 2026-08-26).
 *
 * WHY A SECOND CLIENT MODULE AND NOT AN EDIT TO `typed-client.ts`
 * ---------------------------------------------------------------
 * `lib/api/typed-client.ts` is generic over `types/python-generated/api-types.ts` — the LIVE
 * server contract. HR's 60 paths are not in it and must not be faked into it: the day a family
 * lands for real, its types appear there for the first time and the diff against this stub is the
 * drift detector §6.3 step 4 is built around. Widening the shared client's path union to include
 * paths the server does not serve would destroy exactly that signal.
 *
 * It lives under `lib/api/` because that is the sanctioned client layer
 * (`scripts/check-api-contracts.ts`) — SPEC-CONTRACTS §6.1 is explicit that **no HR file is ever
 * added to the api-contracts baseline**, and putting this here is how that promise is kept.
 *
 * THIS MODULE IS TEMPORARY BY CONSTRUCTION. Per §6.3 step 4 the cutover is per family: when a
 * family's real handlers ship, its callers move to `apiGet`/`apiPost` from `typed-client.ts` and
 * its entries leave the stub. Nothing here survives G3.
 */

import type { paths } from "@/types/python-generated/hr-contracts.api-types";
import { getJson, postJson, type RequestOptions, type ResponseMeta } from "@/lib/python-client";
import { requireSelectedOrgId } from "@/lib/organizations/activeOrg";
import {
  HR_MOCK_ENABLED,
  serveFromFixtures,
  type HrFixtureCase,
} from "@/features/hr/mock/transport";

type HttpMethod = "get" | "post";

export type HrPathWith<M extends HttpMethod> = {
  [P in keyof paths]: paths[P] extends Record<M, infer Op>
    ? Op extends undefined | never
      ? never
      : P
    : never;
}[keyof paths];

type HrOpOf<P extends keyof paths, M extends HttpMethod> = paths[P] extends Record<M, infer O>
  ? O
  : never;

type HrJsonBodyOf<O> = O extends { requestBody: { content: { "application/json": infer B } } }
  ? B
  : O extends { requestBody?: { content: { "application/json": infer B } } }
    ? B | undefined
    : never;

/**
 * The success body. HR has TWO success codes and the difference is load-bearing: a sync endpoint
 * answers 200 with its result, an async one answers 202 with the runtime spine's reference (§1.5).
 */
type HrSuccessOf<O> = O extends {
  responses: { 200: { content: { "application/json": infer R } } };
}
  ? R
  : O extends { responses: { 202: { content: { "application/json": infer R } } } }
    ? R
    : never;

export type HrGetResult<P extends HrPathWith<"get">> = HrSuccessOf<HrOpOf<P, "get">>;
export type HrPostBody<P extends HrPathWith<"post">> = HrJsonBodyOf<HrOpOf<P, "post">>;
export type HrPostResult<P extends HrPathWith<"post">> = HrSuccessOf<HrOpOf<P, "post">>;

type HrEnvelope<T> = Promise<{ data: T; meta: ResponseMeta }>;

/** Options every HR call accepts, plus the mock-case selector §6.4's four cases need. */
export interface HrRequestOptions extends RequestOptions {
  /**
   * Which §6.4 fixture the mock transport should answer with. Ignored entirely when
   * `NEXT_PUBLIC_HR_MOCK` is not `1` — it can never change what a real server returns.
   */
  mockCase?: HrFixtureCase;
}

/**
 * 🚨 EVERY `/hr/*` AND `/esign/*` OPERATION DECLARES `X-Organization-Id` REQUIRED (§1.2), AND
 * NOTHING ELSE IN THIS MODULE'S TRANSPORT CHAIN SENDS IT.
 *
 * `lib/api/organization-context.ts` is the platform's fail-closed kernel for that header, but it
 * was only ever wired into the generic `callApi` path — this client goes straight to
 * `getJson`/`postJson`, which knew nothing about org. Every HR call this lane makes would have
 * gone out unscoped and been refused by the server the day the real handlers land, and in the
 * meantime mock mode would have hidden it completely.
 *
 * So the resolution happens HERE, once, for every HR call: the caller's explicit
 * `organizationId` if it passed one, otherwise the user's explicitly-SELECTED org — never a
 * personal-org fallback, which would make the transport invent scope instead of carrying it.
 * `requireSelectedOrgId` throws before any networking when there is no selection, and
 * `applyOrganizationContextHeader` (inside `buildHeaders`) validates and normalizes the value.
 */
function hrRequestOptions<O extends HrRequestOptions>(opts: O | undefined): O {
  const resolved = { ...(opts ?? ({} as O)) };
  resolved.organizationId = opts?.organizationId ?? requireSelectedOrgId();
  return resolved;
}

/** Fill a path template's `{param}` slots while keeping the template's literal type. */
export function hrBuildPath<P extends keyof paths>(
  template: P,
  params: Record<string, string | number>,
): P {
  return (template as string).replace(/\{([^}]+)\}/g, (_, k: string) => {
    const v = params[k];
    if (v === undefined) {
      throw new Error(`hrBuildPath: missing path parameter "${k}" for "${String(template)}"`);
    }
    return encodeURIComponent(String(v));
  }) as P;
}

const MOCK_META: ResponseMeta = {
  requestId: "hr-mock",
  status: 200,
  serverRequestId: null,
};

/**
 * The transport swap. Returns the fixture envelope when the flag is on AND the path is a mocked HR
 * route; otherwise `null`, and the caller falls through to the real client — so enabling the flag
 * can never silently swallow a call this lane does not own.
 *
 * A fixture whose declared status is not 2xx is THROWN, not returned, so an error fixture exercises
 * the caller's error path exactly as a real 4xx would. §6.4's whole reason for the `error` case is
 * to force the error path to be built at the same time as the happy path.
 */
function tryMock<T>(
  method: string,
  path: string,
  opts?: HrRequestOptions,
): { data: T; meta: ResponseMeta } | null {
  if (!HR_MOCK_ENABLED) return null;
  const served = serveFromFixtures(method, path, opts?.mockCase);
  if (!served) return null;
  if (served.status >= 400) {
    const err = new Error(
      `[hr-mock] ${method} ${path} -> ${served.status} ${served.fixture.__fixture.case}`,
    ) as Error & { status: number; body: unknown; isHrMock: true };
    err.status = served.status;
    err.body = served.body;
    err.isHrMock = true;
    throw err;
  }
  return { data: served.body as T, meta: { ...MOCK_META, status: served.status } };
}

/**
 * GET an HR/e-sign contract path. Response derived from the stub, never asserted.
 *
 * `async` so that a refusal raised BEFORE the request — an error fixture, or a missing
 * organization context — arrives as a rejected promise like every other failure, instead of
 * throwing synchronously past a caller's `.catch()`.
 */
export async function hrApiGet<P extends HrPathWith<"get">>(
  path: P,
  opts?: HrRequestOptions,
): HrEnvelope<HrGetResult<P>> {
  const mocked = tryMock<HrGetResult<P>>("GET", path as string, opts);
  if (mocked) return mocked;
  return getJson<HrGetResult<P>>(path as string, hrRequestOptions(opts));
}

/**
 * POST an HR/e-sign contract path. Body AND response derived from the stub.
 *
 * 🚨 `opts.idempotencyKey` IS NOT OPTIONAL IN PRACTICE. §1.4 requires `X-Idempotency-Key` on
 * every mutating POST, and the key must be minted once per USER INTENT and reused across every
 * retry of that intent. A fresh key on retry is not a smaller version of idempotency — it is
 * none, and on this family it is how a payroll file gets generated twice.
 */
export async function hrApiPost<P extends HrPathWith<"post">>(
  path: P,
  body: HrPostBody<P>,
  opts?: HrRequestOptions,
): HrEnvelope<HrPostResult<P>> {
  const mocked = tryMock<HrPostResult<P>>("POST", path as string, opts);
  if (mocked) return mocked;
  return postJson<HrPostResult<P>, HrPostBody<P>>(
    path as string,
    body,
    hrRequestOptions(opts),
  );
}
