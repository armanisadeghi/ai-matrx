/**
 * lib/api/matrx-transport.ts
 *
 * THE host implementation of `@ai-matrx/agents/matrx`'s `MatrxTransport` port
 * — the ONE seam between the published package's wire semantics (paths,
 * methods, bodies, streaming headers, `Last-Event-ID`) and this app's
 * connection policy. Per the port contract the package owns WHAT is said to
 * the server; this file owns HOW the connection is made:
 *
 *   - base-URL resolution — the SAME machinery `callApi` uses
 *     (`resolveBaseUrl` → `apiConfigSlice.selectResolvedBaseUrl`), plus the
 *     conversation-scoped variant riding `resolveBackendForConversation`
 *     (global / sandbox override / local engine / EC2-dedicated) built in
 *     `features/agents/redux/execution-system/thunks/matrx-transport-for-conversation.ts`
 *     on top of `createMatrxTransportFromTarget` below (lib/api never imports
 *     from features/ — the layering runs the other way);
 *   - credentials — `resolveAuth` (Supabase JWT bearer / guest
 *     `X-Fingerprint-ID`), read fresh from Redux on EVERY call so a token
 *     refresh mid-run is picked up, exactly like `callApi`;
 *   - the `X-Organization-Id` context header via the one
 *     `applyOrganizationContextHeader` primitive (the global transport
 *     REQUIRES an org, matching `callApi`'s preflight refusal; the
 *     conversation transport matches `runAiStream`, which sends org in the
 *     body only);
 *   - the AI API version prefix for already-interpolated paths
 *     (`applyAiApiVersion`) + the v2 → v1 transport fallback
 *     (`fetchWithV2Fallback` — the same function `callApi` runs);
 *   - `resilientFetch` timeouts: connect 15s (parity with `callApi`; for a
 *     non-streaming FastAPI handler this is effectively time-to-response),
 *     total UNCAPPED — the port cannot distinguish a JSON call from an NDJSON
 *     stream, and capping would kill long streams; the connect timeout is the
 *     real JSON guard;
 *   - diagnostics: `logApiTarget` at the last pre-fetch moment and the
 *     `captureApiError` sink for every non-2xx and thrown network failure
 *     (`expectedErrorStatuses` opts a call class out, same as `callApi`).
 *
 * Auth, URL and error logic are IMPORTED from `call-api.ts` — a second copy
 * of any of it is the exact defect the package-adoption campaign exists to
 * kill.
 */

import type { Action } from "redux";
import type { ThunkAction } from "redux-thunk";
import type { RootState } from "@/lib/redux/store";
import {
  cancelAgentRun,
  MatrxApiError,
  extractMatrxErrorMessage,
  type MatrxCancelResponse,
  type MatrxTransport,
  type MatrxTransportRequest,
} from "@ai-matrx/agents/matrx";
import {
  fetchWithV2Fallback,
  normalizeError,
  resolveAuth,
  resolveBaseUrl,
  waitForAuthReady,
  type ApiCallError,
  type ApiCallResult,
} from "@/lib/api/call-api";
import {
  applyOrganizationContextHeader,
  requireOrganizationContext,
} from "@/lib/api/organization-context";
import { applyAiApiVersion } from "@/lib/api/ai-api-version";
import { selectAiApiVersion } from "@/lib/redux/slices/apiConfigSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { logApiTarget } from "@/lib/api/log-api-target";
import { captureApiError } from "@/lib/diagnostics/captureApiError";

/**
 * A fully-resolved connection target for one call: where to send it and which
 * policy headers ride ON TOP of the package's wire headers. `policyHeaders`
 * must never carry `Content-Type` — the package owns wire headers; merging a
 * policy `Content-Type` over a GET SSE call would corrupt the wire.
 */
export interface MatrxTransportTarget {
  /** Fully-qualified base URL, no trailing slash. */
  baseUrl: string;
  /** Auth (+ optional org) headers merged on top of the wire headers. */
  policyHeaders: Record<string, string>;
  /** Routing channel label for `logApiTarget` telemetry. */
  channel: string;
}

export interface MatrxTransportOptions {
  /**
   * HTTP failures this transport's call class fully handles as expected
   * domain outcomes (e.g. 404 on runtime-operation identify). They still
   * reach the package (which maps them to typed results) but do not create a
   * system_error row. Mirrors `callApi`'s `expectedErrorStatuses`.
   */
  expectedErrorStatuses?: readonly number[];
  /** Short call-site label for `logApiTarget` (default "matrxTransport"). */
  source?: string;
}

/**
 * Build a `MatrxTransport` from a per-call target resolver. This is the ONE
 * fetch pipeline every host transport shares: fresh state per call, AI-version
 * path transform, wire-headers-first merge (policy headers on top, wire
 * headers never dropped), signal wired through, v2→v1 fallback, capture sinks.
 */
export function createMatrxTransportFromTarget(
  getState: () => RootState,
  resolveTarget: (state: RootState) => MatrxTransportTarget,
  options: MatrxTransportOptions = {},
): MatrxTransport {
  const source = options.source ?? "matrxTransport";
  return {
    async fetch(path: string, init: MatrxTransportRequest): Promise<Response> {
      const state = getState();
      const target = resolveTarget(state);

      // `path` is already interpolated (`/ai/agents/<uuid>`), so the version
      // transform is the concrete-path bridge, not the template registry.
      const versionedPath = applyAiApiVersion(
        path,
        selectAiApiVersion(state),
      );
      const url = `${target.baseUrl}${versionedPath}`;

      // Wire headers FIRST, policy headers on top — the port contract: the
      // host merges auth/org over the call's `Content-Type` / `Accept` /
      // `Last-Event-ID` without dropping them.
      const headers: Record<string, string> = {
        ...init.headers,
        ...target.policyHeaders,
      };

      logApiTarget(url, {
        source,
        method: init.method,
        channel: target.channel,
        activeServer: state.apiConfig?.activeServer,
      });

      let response: Response;
      try {
        ({ response } = await fetchWithV2Fallback(
          url,
          {
            method: init.method,
            headers,
            ...(init.body !== undefined ? { body: init.body } : {}),
          },
          {
            signal: init.signal,
            connectTimeoutMs: 15_000,
            // Uncapped: the port cannot tell a JSON call from a long-lived
            // NDJSON/SSE stream. The connect timeout is the JSON guard (a
            // FastAPI JSON handler sends nothing until it returns).
            totalTimeoutMs: null,
            throwOnHttpError: false,
          },
        ));
      } catch (err) {
        captureApiError(normalizeError(err), {
          url,
          method: init.method,
          path,
        });
        throw err;
      }

      if (
        !response.ok &&
        !options.expectedErrorStatuses?.includes(response.status)
      ) {
        // The package consumes the original body for its MatrxApiError; read
        // the capture copy from a clone so the two never fight.
        const serverDetail: unknown = await response
          .clone()
          .json()
          .catch(() => undefined);
        captureApiError(
          {
            type:
              response.status >= 400 && response.status < 500
                ? "validation_error"
                : "http_error",
            message:
              extractMatrxErrorMessage(serverDetail) ??
              `HTTP ${response.status}`,
            status: response.status,
            serverDetail,
          },
          { url, method: init.method, path },
        );
      }

      return response;
    },
  };
}

/**
 * The GLOBAL transport — `callApi` parity: `resolveBaseUrl` (apiConfigSlice),
 * `resolveAuth` credentials, and a REQUIRED `X-Organization-Id` bound to the
 * active app-context org (or the explicit override). Use this for every
 * package call that `callApi` would have served (cancel, one-shot runs,
 * runtime-operation reads); conversation-bound streams use the
 * conversation-scoped variant instead.
 */
export function createMatrxTransport(
  getState: () => RootState,
  options: MatrxTransportOptions & { organizationId?: string } = {},
): MatrxTransport {
  return createMatrxTransportFromTarget(
    getState,
    (state) => {
      const auth = resolveAuth(state);
      // `resolveAuth` bundles Content-Type for callApi's own pipeline; the
      // package owns wire headers, so only the credential headers are policy.
      const { "Content-Type": _wireOwned, ...credentialHeaders } = auth.headers;
      const hasAppContext = !!(state as Partial<RootState>)?.appContext;
      const organizationId = requireOrganizationContext(
        hasAppContext ? selectOrganizationId(state) : undefined,
        options.organizationId,
      );
      return {
        baseUrl: resolveBaseUrl(state),
        policyHeaders: applyOrganizationContextHeader(
          credentialHeaders,
          organizationId,
        ),
        channel: "global",
      };
    },
    options,
  );
}

/**
 * Map a failure thrown by the package client (`MatrxApiError`, a NetError
 * from the transport, an abort) onto `callApi`'s `ApiCallError` envelope so
 * existing consumers keep one error shape across both pipelines.
 */
export function normalizeMatrxClientError(err: unknown): ApiCallError {
  if (err instanceof MatrxApiError) {
    return {
      type:
        err.status >= 400 && err.status < 500
          ? "validation_error"
          : "http_error",
      message: err.message,
      status: err.status,
      serverDetail: err.serverDetail,
      ...(err.code ? { code: err.code } : {}),
      name: err.name,
    };
  }
  return normalizeError(err);
}

// ─── Cancel: Abort a running request (moved from call-api.ts) ────────────────

/**
 * Stop a running request at its next iteration boundary —
 * `POST /ai/cancel/{request_id}` via `@ai-matrx/agents/matrx`'s
 * `cancelAgentRun` over the global transport. `mode: "interrupt"` =
 * stop-and-fork (the INTERRUPT send mode): the server hides the tail produced
 * after the last clean boundary so the user's follow-up replies to the last
 * thing they actually saw. Plain "cancel" keeps everything visible.
 *
 * Same call contract as the retired `callCancelRequest`: resolves an
 * `ApiCallResult` (never throws), auth + org headers identical, error
 * envelope preserved for the best-effort callers in `smart-execute.thunk.ts`.
 */
export function cancelAgentRunRequest(
  requestId: string,
  mode: "cancel" | "interrupt" = "cancel",
): ThunkAction<
  Promise<ApiCallResult<MatrxCancelResponse>>,
  RootState,
  unknown,
  Action
> {
  return async (_dispatch, getState) => {
    await waitForAuthReady(getState);
    const transport = createMatrxTransport(getState);
    try {
      const data = await cancelAgentRun(transport, requestId, { mode });
      return { data, requestId: data.request_id };
    } catch (err) {
      // Non-2xx / network failures were already fed to `captureApiError` by
      // the transport — normalize for the caller, never capture twice.
      return { error: normalizeMatrxClientError(err) };
    }
  };
}
