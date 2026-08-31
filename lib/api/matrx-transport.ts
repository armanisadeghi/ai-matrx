/**
 * lib/api/matrx-transport.ts
 *
 * THE host wiring for `@ai-matrx/agents/matrx`'s production transport. Since
 * the 0.6.0 C22 retrofit the whole connection pipeline — resilient fetch with
 * the connect-15s / total-uncapped policy, the AI-version path transform and
 * v2 → v1 fallback, fresh-per-call credentials, the fail-closed
 * `X-Organization-Id` binding, error classification — lives IN the package
 * (`createMatrxTransport`). This module injects ONLY app identity:
 *
 *   - base URL — `resolveBaseUrl` (apiConfigSlice), same machinery `callApi`
 *     uses; the conversation-scoped variant rides
 *     `resolveBackendForConversation` via `createMatrxTransportFromTarget`
 *     (built on in `features/agents/.../matrx-transport-for-conversation.ts`
 *     — lib/api never imports from features/);
 *   - credentials — a `CredentialsPort` over Redux (`selectAccessToken` /
 *     `selectFingerprintId`), read fresh on EVERY call so a token refresh
 *     mid-run is picked up, exactly like `callApi`;
 *   - the active org (the global transport REQUIRES one, matching `callApi`'s
 *     preflight refusal; the conversation transport sends org in the body
 *     only and configures none);
 *   - the app's AI API version flag (`selectAiApiVersion` — the admin
 *     sidebar toggle);
 *   - diagnostics sinks: `logApiTarget`, `captureApiError`, and the
 *     `ai_v2_downgrade` telemetry record.
 */

import type { Action } from "redux";
import type { ThunkAction } from "redux-thunk";
import type { RootState } from "@/lib/redux/store";
import type { CredentialsPort, MatrxCredential } from "@ai-matrx/data";
import {
  cancelAgentRun,
  createMatrxTransport as createPackageTransport,
  normalizeMatrxError,
  requireOrganizationContext,
  type MatrxCancelResponse,
  type MatrxTransport,
  type MatrxTransportDiagnostics,
} from "@ai-matrx/agents/matrx";
import {
  resolveBaseUrl,
  waitForAuthReady,
  type ApiCallError,
  type ApiCallResult,
} from "@/lib/api/call-api";
import {
  selectAccessToken,
  selectFingerprintId,
} from "@/lib/redux/slices/userSlice";
import { selectAiApiVersion } from "@/lib/redux/slices/apiConfigSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { logApiTarget } from "@/lib/api/log-api-target";
import { captureApiError } from "@/lib/diagnostics/captureApiError";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

/**
 * A fully-resolved connection target for one call: where to send it and which
 * policy headers ride ON TOP of the package's wire headers (the package
 * strips any policy `Content-Type` — the wire owns it).
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

/** The app's Redux-backed credential source — read fresh per call. */
function credentialsFromState(getState: () => RootState): CredentialsPort {
  return {
    get: async (): Promise<MatrxCredential | null> => {
      const state = getState();
      const accessToken = selectAccessToken(state);
      if (accessToken) return { kind: "user", accessToken };
      const fingerprintId = selectFingerprintId(state);
      if (fingerprintId) return { kind: "guest", fingerprintId };
      return null;
    },
  };
}

/** The app's diagnostics sinks, wired into the package's typed seam. */
function diagnosticsFromState(
  getState: () => RootState,
): MatrxTransportDiagnostics {
  return {
    onRequest: (info) => {
      logApiTarget(info.url, {
        source: info.source,
        method: info.method,
        channel: info.channel,
        activeServer: getState().apiConfig?.activeServer,
      });
    },
    onError: (error, info) => {
      captureApiError(error, {
        url: info.url,
        method: info.method,
        path: info.path,
      });
    },
    onProtocolDowngrade: (downgrade) => {
      captureError({
        source: "api-http",
        code: "ai_v2_downgrade",
        message: `v2 endpoint failed (${downgrade.reason}); request served by v1 fallback`,
        details: downgrade.url,
        ...(downgrade.status !== undefined ? { status: downgrade.status } : {}),
      });
    },
  };
}

/**
 * Build a `MatrxTransport` from a per-call target resolver — the shared
 * identity wiring both host transports (global + conversation) ride: fresh
 * state per call, the app's AI-version flag, Redux credentials, and the
 * diagnostics sinks, over the package's production pipeline.
 */
export function createMatrxTransportFromTarget(
  getState: () => RootState,
  resolveTarget: (state: RootState) => MatrxTransportTarget,
  options: MatrxTransportOptions = {},
): MatrxTransport {
  // No CredentialsPort here: a target resolver carries its own credential
  // headers (the conversation lane's resolver bundles the JWT/fingerprint,
  // re-read fresh per call) — exactly like the pre-package pipeline.
  return createPackageTransport({
    resolveTarget: () => resolveTarget(getState()),
    aiApiVersion: () => selectAiApiVersion(getState()),
    diagnostics: diagnosticsFromState(getState),
    ...(options.expectedErrorStatuses
      ? { expectedErrorStatuses: options.expectedErrorStatuses }
      : {}),
    ...(options.source ? { source: options.source } : {}),
  });
}

/**
 * The GLOBAL transport — `callApi` parity: `resolveBaseUrl` (apiConfigSlice)
 * and a REQUIRED `X-Organization-Id` bound to the active app-context org (or
 * the explicit override). Use this for every package call that `callApi`
 * would have served (cancel, one-shot runs, runtime-operation reads);
 * conversation-bound streams use the conversation-scoped variant instead.
 */
export function createMatrxTransport(
  getState: () => RootState,
  options: MatrxTransportOptions & { organizationId?: string } = {},
): MatrxTransport {
  return createPackageTransport({
    // Org admission rides as a per-request policy header (resolved fresh per
    // call, like the credentials) instead of the package's `organizationId`
    // option, because that option is unconditionally fail-closed and would
    // hold the GUEST lane to the JWT rule. The server admits the fingerprint
    // lane org-less (a guest has no membership to verify — matrx-connect
    // 241750bf6): a guest sends no X-Organization-Id unless the caller
    // explicitly resolved one, while a Bearer request stays fail-closed on
    // the selected organization — never a first/personal fallback.
    resolveTarget: () => {
      const state = getState();
      const isAuthenticated = !!selectAccessToken(state);
      const hasAppContext = !!(state as Partial<RootState>)?.appContext;
      let organizationId: string | null = null;
      if (isAuthenticated) {
        organizationId = requireOrganizationContext(
          hasAppContext ? selectOrganizationId(state) : undefined,
          options.organizationId,
        );
      } else if (options.organizationId) {
        organizationId = requireOrganizationContext(
          null,
          options.organizationId,
        );
      }
      return {
        baseUrl: resolveBaseUrl(state),
        channel: "global",
        ...(organizationId
          ? { policyHeaders: { "X-Organization-Id": organizationId } }
          : {}),
      };
    },
    credentials: credentialsFromState(getState),
    aiApiVersion: () => selectAiApiVersion(getState()),
    diagnostics: diagnosticsFromState(getState),
    ...(options.expectedErrorStatuses
      ? { expectedErrorStatuses: options.expectedErrorStatuses }
      : {}),
    ...(options.source ? { source: options.source } : {}),
  });
}

/**
 * Map a failure thrown by the package client onto `callApi`'s `ApiCallError`
 * envelope. The classification itself lives in the package
 * (`normalizeMatrxError`) — this is a type-level bridge only.
 */
export function normalizeMatrxClientError(err: unknown): ApiCallError {
  return normalizeMatrxError(err);
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
