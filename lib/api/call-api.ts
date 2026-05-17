/**
 * lib/api/call-api.ts
 *
 * THE unified entry point for every Python FastAPI backend call.
 *
 * Nothing should call fetch() against the backend directly.
 * Everything goes through callApi() so auth, URL, scope, type-safety,
 * and test overrides are handled in one place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * callApi(config)  →  AppThunk  ──reads──▶  Redux state
 *                                            ├─ Auth      (userSlice)
 *                                            ├─ URL       (adminPreferencesSlice — multi-env)
 *                                            └─ Scope     (TODO: appContextSlice)
 *
 * All context comes from Redux. Components dispatch callApi() like any
 * other thunk. Hooks simply call useAppDispatch()(callApi(...)).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TYPE SAFETY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Request bodies are inferred directly from types/python-generated/api-types.ts.
 * If you pass the wrong body shape TypeScript will error at the call site,
 * not at runtime.
 *
 * Example:
 *   dispatch(callApi({
 *     path: '/ai/agents/{agent_id}',
 *     method: 'POST',
 *     pathParams: { agent_id: promptId },
 *     body: {                           // ← typed as AgentStartRequest
 *       user_input: 'Hello',
 *       stream: true,
 *       debug: false,
 *       client_tools: [],
 *     },
 *     onStreamEvent: (event) => ...,
 *   }));
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ADDING NEW SCOPE FIELDS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. Add the field to CallScope below.
 * 2. Add a selector to extract it from Redux state in resolveScope().
 * 3. If no Redux slice exists yet, add a TODO to appContextSlice.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── External dependencies ───────────────────────────────────────────────────

import type { Action } from "redux";
import type { ThunkAction } from "redux-thunk";

// ─── Internal infrastructure ─────────────────────────────────────────────────

import type { RootState } from "@/lib/redux/store";
import {
  selectAccessToken,
  selectFingerprintId,
  selectAuthReady,
  selectIsAuthenticated,
  selectIsSuperAdmin,
} from "@/lib/redux/slices/userSlice";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import {
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
  selectConversationId,
} from "@/lib/redux/slices/appContextSlice";
import { isPersonalPseudoOrgId } from "@/features/agent-context/redux/hierarchySlice";
// BACKEND_URLS no longer needed here — URL resolution is owned by apiConfigSlice
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { resilientFetch } from "@/lib/net/resilient-fetch";
import { isNetError } from "@/lib/net/errors";
import { extractErrorMessage } from "@/utils/errors";

// ─── Auto-generated types (source of truth for all request/response shapes) ──

import type { paths, components } from "@/types/python-generated/api-types";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";

// ============================================================================
// SECTION 1 — UTILITY TYPE HELPERS
// ============================================================================

/** All HTTP methods the generated schema uses */
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/**
 * Given a path key and method, extract the operation object from the schema.
 * e.g. PathOperation<'/ai/agents/{agent_id}', 'POST'> → operations['start_agent_...']
 */
type PathOperation<P extends keyof paths, M extends HttpMethod> =
  Lowercase<M> extends keyof paths[P] ? paths[P][Lowercase<M>] : never;

/**
 * Given an operation, extract the JSON request body type.
 * Returns `never` if the operation has no request body.
 */
type OperationRequestBody<Op> = Op extends {
  requestBody: { content: { "application/json": infer T } };
}
  ? T
  : never;

/**
 * Given an operation, extract the 200-response JSON type.
 * Returns `unknown` if not inferrable.
 */
type OperationResponse<Op> = Op extends {
  responses: { 200: { content: { "application/json": infer T } } };
}
  ? T
  : unknown;

/**
 * Extract path parameter names from a URL template string.
 * e.g. '/ai/agents/{agent_id}' → { agent_id: string }
 *      '/ai/conversations/{conversation_id}/tool_results' → { conversation_id: string }
 */
type ExtractPathParams<P extends string> = string extends P
  ? Record<string, string>
  : P extends `${infer _}${"{"}${infer Param}${"}"}${infer Rest}`
    ? { [K in Param | keyof ExtractPathParams<Rest>]: string }
    : Record<never, never>;

/** Whether a path has any path parameters */
type HasPathParams<P extends string> = keyof ExtractPathParams<P> extends never
  ? false
  : true;

// ============================================================================
// SECTION 2 — AUTH
// ============================================================================

/** The resolved auth mode for a given call */
export type AuthMode = "authenticated" | "admin" | "guest";

/** The resolved auth state — ready to inject into request headers */
export interface ResolvedAuth {
  mode: AuthMode;
  headers: Record<string, string>;
}

// ============================================================================
// SECTION 3 — CONTEXT SCOPE
// ============================================================================

/**
 * All context dimensions that may be injected into API requests.
 *
 * Fields are optional — only present ones are sent.
 * Auto-resolved from Redux; the caller only needs to supply overrides.
 *
 * TODO: Create a `appContextSlice` (single slice for the full hierarchy) to hold:
 *   - organization_id  (org context) ← DONE: appContextSlice
 *   - project_id       (project context) ← DONE: appContextSlice
 *   - task_id          (task context) ← DONE: appContextSlice
 *   - conversation_id  (active conversation — also in cx-conversation) ← DONE: appContextSlice
 *
 * Use a SINGLE slice (not multiple) because the full hierarchy is one unified
 * "where are you working" state and is always read together.
 */
export interface CallScope {
  /** Resolved automatically from Redux userSlice */
  user_id?: string;

  /** Resolved from appContextSlice. Injected automatically into every request body. */
  organization_id?: string;

  /** Resolved from appContextSlice. Injected automatically into every request body. */
  project_id?: string;

  /** Resolved from appContextSlice. Injected automatically into every request body. */
  task_id?: string;

  /**
   * Conversation ID — NOT auto-injected into the body.
   * Used as a path parameter or passed explicitly in the body by the caller.
   */
  conversation_id?: string;
}

// ============================================================================
// SECTION 4 — TEST / DEMO OVERRIDES (Placeholder)
// ============================================================================

/**
 * Per-call test and demo overrides.
 *
 * TODO: Expand this when the demo/test override system is formalized.
 * The demo pages (app/(public)/demos/) currently wire their own server
 * selectors — when we migrate those, the full shape will be defined here.
 *
 * These are intentionally typed loosely for now to avoid premature API lock-in.
 */
export interface TestOverrides {
  /** Force a specific base URL regardless of Redux state */
  forceBaseUrl?: string;

  /** Inject additional request headers (e.g., test tokens) */
  additionalHeaders?: Record<string, string>;

  /** Short-circuit the actual fetch and return this mock response */
  mockResponse?: unknown;

  /**
   * When true, adds verbose logging of the full request before sending.
   * Useful for the demo clients that display the raw request.
   */
  logRequest?: boolean;
}

// ============================================================================
// SECTION 5 — CALL CONFIGURATION
// ============================================================================

/**
 * Full configuration for a single API call.
 *
 * The `body` field is automatically typed from the generated OpenAPI schema —
 * TypeScript will error at the call site if you pass the wrong shape.
 *
 * The `pathParams` field is also typed from the URL template — only required
 * when the path contains `{param}` segments.
 */
export interface ApiCallConfig<
  P extends keyof paths = keyof paths,
  M extends HttpMethod = HttpMethod,
  Op = PathOperation<P, M>,
> {
  // ── Endpoint ─────────────────────────────────────────────────────────────

  /** The FastAPI route path (must be a key of the generated `paths` interface) */
  path: P;

  /** HTTP method */
  method: M;

  /**
   * Path parameter values.
   * Only required (and typed) when the path contains `{param}` segments.
   * e.g. path: '/ai/agents/{agent_id}' → pathParams: { agent_id: 'abc-123' }
   */
  pathParams?: ExtractPathParams<P & string>;

  /** Query string parameters */
  queryParams?: Record<string, string | number | boolean>;

  // ── Request body (inferred from generated schema) ────────────────────────

  /**
   * Request body — typed directly from the generated OpenAPI schema.
   * Passing the wrong shape is a compile-time TypeScript error.
   */
  body?: OperationRequestBody<Op>;

  // ── Streaming ────────────────────────────────────────────────────────────

  /**
   * Set to true for NDJSON streaming endpoints (most AI routes).
   * When true, responses are parsed via parseNdjsonStream and delivered
   * to the callbacks below.
   */
  stream?: boolean;

  /**
   * Called immediately when response headers arrive — BEFORE any stream events.
   * Use this to capture conversationId for URL updates, bookmarking, etc.
   * Guaranteed to fire before onStreamEvent.
   */
  onStreamStart?: (
    requestId: string | null,
    conversationId: string | null,
  ) => void;

  /** Called for each NDJSON event during streaming */
  onStreamEvent?: (event: TypedStreamEvent) => void;

  /** Called when the stream ends cleanly */
  onStreamComplete?: (
    requestId: string | null,
    conversationId: string | null,
  ) => void;

  /** Called if the stream errors */
  onStreamError?: (error: ApiCallError) => void;

  /** AbortController signal — pass to cancel mid-stream */
  signal?: AbortSignal;

  // ── Context scope overrides ───────────────────────────────────────────────

  /**
   * Override or supplement the auto-resolved scope.
   * Auto-resolved fields (user_id, org, project, task) are filled from Redux —
   * only pass fields you want to explicitly set or override.
   */
  scopeOverrides?: Partial<CallScope>;

  // ── Test / Demo overrides (placeholder) ──────────────────────────────────

  /**
   * Per-call test and demo overrides.
   * Prefixed with `_` to signal non-production use.
   */
  _testOverrides?: TestOverrides;
}

// ============================================================================
// SECTION 6 — CALL RESULT + ERRORS
// ============================================================================

export interface ApiCallError {
  type:
    | "auth_error"
    | "network_error"
    | "http_error"
    | "validation_error"
    | "abort_error"
    | "unknown";
  message: string;
  /** HTTP status code, if applicable */
  status?: number;
  /** Raw error detail from the server (e.g. HTTPValidationError.detail) */
  serverDetail?: unknown;
}

export interface ApiCallResult<T = unknown> {
  /** Parsed JSON response body (non-streaming calls only) */
  data?: T;
  /** Server-assigned request ID (from response header) */
  requestId?: string;
  /** Server-assigned conversation ID (from response header or stream event) */
  conversationId?: string;
  /** Set if the call failed */
  error?: ApiCallError;
}

// ============================================================================
// SECTION 7 — AUTH RESOLUTION
// ============================================================================

/**
 * Resolve the auth mode and build request headers from Redux state.
 *
 * Priority:
 *   1. Authenticated user with JWT token → Bearer token header
 *   2. Admin user (subset of authenticated) → same Bearer token header, mode is 'admin'
 *   3. Guest user with fingerprint → X-Fingerprint-ID header
 *
 * NOTE: This runs synchronously from Redux state snapshot.
 * For the async "wait for auth to be ready" case, see waitForAuthReady().
 */
function resolveAuth(state: RootState): ResolvedAuth {
  const accessToken = selectAccessToken(state);
  const fingerprintId = selectFingerprintId(state);
  const isAdmin = selectIsSuperAdmin(state);
  const isAuthenticated = selectIsAuthenticated(state);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
    return {
      mode: isAdmin ? "admin" : "authenticated",
      headers,
    };
  }

  if (fingerprintId) {
    headers["X-Fingerprint-ID"] = fingerprintId;
    return { mode: "guest", headers };
  }

  // No credentials available yet — return guest headers without fingerprint.
  // The caller should have called waitForAuthReady() before dispatching.
  return { mode: "guest", headers };
}

/**
 * Wait for the Redux auth state to be ready before reading it.
 *
 * Polls getState() directly so there is no Hook dependency.
 * Safe to call from any async thunk.
 *
 * TODO: Consider exposing the fingerprint-fetch fallback (currently only in
 * useApiAuth hook). For thunks, a separate fingerprint-thunk should exist.
 */
async function waitForAuthReady(
  getState: () => RootState,
  timeoutMs = 1000,
): Promise<boolean> {
  const pollMs = 50;
  let elapsed = 0;

  while (elapsed < timeoutMs) {
    const state = getState();
    const isReady = selectAuthReady(state);
    const hasToken = !!selectAccessToken(state);
    const hasFingerprint = !!selectFingerprintId(state);

    if (isReady || hasToken || hasFingerprint) {
      return true;
    }

    await new Promise<void>((r) => setTimeout(r, pollMs));
    elapsed += pollMs;
  }

  // TODO: Trigger fingerprint-fetch thunk as fallback (same pattern as useApiAuth).
  // For now, warn and proceed — the request will be sent without an auth credential.
  console.warn(
    "[callApi] Auth not ready after timeout — proceeding without credentials.",
  );
  return false;
}

// ============================================================================
// SECTION 8 — URL RESOLUTION
// ============================================================================

/**
 * Resolve the base backend URL from Redux state.
 *
 * Logic:
 *   1. testOverrides.forceBaseUrl always wins (testing/demo bypass)
 *   2. Read selectResolvedBaseUrl from apiConfigSlice — single source of truth
 *      for all users. The active server is whatever Redux says it is.
 *
 * If the resolved URL is undefined (env var not set for the selected environment),
 * an error is thrown so the misconfiguration is immediately obvious.
 */
function resolveBaseUrl(
  state: RootState,
  testOverrides?: TestOverrides,
): string {
  if (testOverrides?.forceBaseUrl) {
    return testOverrides.forceBaseUrl;
  }

  const url = selectResolvedBaseUrl(state as any);
  if (!url) {
    const env = (state as any)?.apiConfig?.activeServer ?? "production";
    throw new Error(
      `[callApi] No URL configured for server environment "${env}". ` +
        `Set the corresponding NEXT_PUBLIC_BACKEND_URL_* env variable, ` +
        `or enter a custom URL via the admin indicator.`,
    );
  }
  return url;
}

/**
 * Build the full URL for the request.
 *
 * - Substitutes path parameters (e.g. {agent_id} → actual ID)
 * - Strips any leading /api prefix (backend no longer requires it)
 * - Appends query string when provided
 */
function buildUrl(
  baseUrl: string,
  pathTemplate: string,
  pathParams?: Record<string, string>,
  queryParams?: Record<string, string | number | boolean>,
): string {
  // Substitute path parameters
  let resolvedPath = pathTemplate;
  if (pathParams) {
    for (const [key, value] of Object.entries(pathParams)) {
      resolvedPath = resolvedPath.replace(
        `{${key}}`,
        encodeURIComponent(value),
      );
    }
  }

  // Strip the /api prefix — the backend routes no longer live under /api/*.
  // Both legacy paths (starting with /api/) and new paths (without it) are handled correctly.
  const fullPath = resolvedPath.startsWith("/api/")
    ? resolvedPath.slice(4)
    : resolvedPath;

  const url = `${baseUrl}${fullPath}`;

  // Append query string
  if (queryParams && Object.keys(queryParams).length > 0) {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(queryParams).map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    return `${url}?${qs}`;
  }

  return url;
}

// ============================================================================
// SECTION 9 — SCOPE RESOLUTION
// ============================================================================

/**
 * Resolve the context scope from Redux state, merged with any per-call overrides.
 *
 * Fields that are undefined are omitted from the final scope object.
 *
 * Resolve the context scope from Redux state, merged with any per-call overrides.
 *
 * Fields that are null/undefined are omitted from the final scope object.
 */
function resolveScope(
  state: RootState,
  overrides?: Partial<CallScope>,
): CallScope {
  // user_id: available from existing userSlice
  // TODO: replace with a proper selector once userSlice exposes profile.id directly
  const userId: string | undefined =
    (state as any)?.user?.profile?.id ?? undefined;

  // appContext may be absent in store configurations that haven't registered the slice.
  // Guard defensively so callApi never crashes on a missing key — all fields are nullable.
  const hasAppContext = !!(state as any)?.appContext;

  // Drop the synthetic Personal pseudo-org id before sending to the backend.
  // The sentinel is a UI-only construct that maps to "no org" server-side.
  const rawOrgId = hasAppContext ? selectOrganizationId(state) : undefined;
  const sanitizedOrgId =
    rawOrgId && !isPersonalPseudoOrgId(rawOrgId) ? rawOrgId : undefined;

  const resolved: CallScope = {
    user_id: userId,
    organization_id: sanitizedOrgId,
    project_id: hasAppContext
      ? (selectProjectId(state) ?? undefined)
      : undefined,
    task_id: hasAppContext ? (selectTaskId(state) ?? undefined) : undefined,
    conversation_id: hasAppContext
      ? (selectConversationId(state) ?? undefined)
      : undefined,
  };

  // Merge caller-supplied overrides (they win over auto-resolved)
  return { ...resolved, ...overrides };
}

// ============================================================================
// SECTION 10 — REQUEST BODY ASSEMBLY
// ============================================================================

/**
 * UI-only fields that must never be sent to the Python backend.
 * These are capability flags used internally by the frontend to determine
 * which input types to show — the backend's UnifiedConfig rejects them.
 */
const UI_ONLY_BODY_FIELDS = new Set<string>([
  "youtube_videos",
  "file_urls",
  "image_urls",
]);

/**
 * Assemble the final request body, injecting scope fields automatically.
 *
 * The backend accepts scope fields (organization_id, project_id,
 * task_id) on every AI endpoint body. Fields that are undefined are stripped
 * by JSON.stringify so endpoints that don't declare them simply ignore them —
 * no validation errors will occur.
 *
 * user_id and conversation_id are NOT injected here:
 *   - user_id   → resolved from the auth header (JWT sub claim), never the body
 *   - conversation_id → either a path parameter or an explicit body field
 *     managed by the caller
 *
 * UI-only capability flags (youtube_videos, file_urls, image_urls) are always
 * stripped — they are internal frontend signals and are not part of the backend schema.
 */
function buildRequestBody(body: unknown, scope: CallScope): unknown {
  const raw = (body ?? {}) as Record<string, unknown>;

  // Strip UI-only fields before sending to the backend
  const base: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!UI_ONLY_BODY_FIELDS.has(key)) {
      base[key] = value;
    }
  }

  // Only inject fields that have an actual value — undefined keys are omitted
  // from JSON.stringify, so endpoints that don't declare these fields are unaffected.
  const scopeFields: Record<string, unknown> = {};
  if (scope.organization_id !== undefined)
    scopeFields.organization_id = scope.organization_id;
  if (scope.project_id !== undefined) scopeFields.project_id = scope.project_id;
  if (scope.task_id !== undefined) scopeFields.task_id = scope.task_id;

  // Scope fields do NOT override values the caller already set explicitly in the body.
  // Caller-supplied values win — scope fills in what's missing.
  return { ...scopeFields, ...base };
}

// ============================================================================
// SECTION 11 — TEST OVERRIDES APPLICATION
// ============================================================================

/** Apply test-mode header overrides */
function applyTestHeaders(
  headers: Record<string, string>,
  testOverrides?: TestOverrides,
): Record<string, string> {
  if (!testOverrides?.additionalHeaders) return headers;
  return { ...headers, ...testOverrides.additionalHeaders };
}

/** Log request details when test overrides request it */
function maybeLogRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
  testOverrides?: TestOverrides,
): void {
  if (!testOverrides?.logRequest) return;
  console.group(`[callApi] ${method.toUpperCase()} ${url}`);
  console.log("Headers:", headers);
  console.log("Body:", body);
  console.groupEnd();
}

// ============================================================================
// SECTION 12 — ERROR NORMALIZATION
// ============================================================================

function normalizeError(err: unknown): ApiCallError {
  if (err instanceof DOMException && err.name === "AbortError") {
    return { type: "abort_error", message: "Request was cancelled." };
  }

  if (isNetError(err)) {
    if (err.code === "aborted") {
      return { type: "abort_error", message: err.message };
    }
    if (
      err.code === "connect-timeout" ||
      err.code === "total-timeout" ||
      err.code === "heartbeat-timeout"
    ) {
      return { type: "network_error", message: err.message };
    }
    if (err.code === "http") {
      const status = err.status ?? 0;
      return {
        type: status >= 400 && status < 500 ? "validation_error" : "http_error",
        message: err.message,
        status,
      };
    }
    return { type: "network_error", message: err.message };
  }

  if (err instanceof Error) {
    // HTTP error format from existing infrastructure: "HTTP 422: ..."
    const httpMatch = err.message.match(/HTTP (\d+):\s*(.*)/);
    if (httpMatch) {
      const status = parseInt(httpMatch[1], 10);
      return {
        type: status >= 400 && status < 500 ? "validation_error" : "http_error",
        message: httpMatch[2] ?? err.message,
        status,
      };
    }

    return { type: "network_error", message: err.message };
  }

  return { type: "unknown", message: extractErrorMessage(err) };
}

// ============================================================================
// SECTION 13 — EXECUTION: JSON (non-streaming)
// ============================================================================

async function executeJsonRequest<T>(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<ApiCallResult<T>> {
  const hasBody = method !== "GET" && method !== "HEAD";

  const { response } = await resilientFetch(
    url,
    {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
    },
    {
      signal,
      connectTimeoutMs: 15_000,
      totalTimeoutMs: 30_000,
      throwOnHttpError: false,
    },
  );

  const requestId = response.headers.get("X-Request-ID") ?? undefined;
  const conversationId = response.headers.get("X-Conversation-ID") ?? undefined;

  if (!response.ok) {
    const serverDetail = await response.json().catch(() => undefined);
    return {
      requestId,
      conversationId,
      error: {
        type:
          response.status >= 400 && response.status < 500
            ? "validation_error"
            : "http_error",
        message: `HTTP ${response.status}`,
        status: response.status,
        serverDetail,
      },
    };
  }

  const data = (await response.json()) as T;
  return { data, requestId, conversationId };
}

// ============================================================================
// SECTION 14 — EXECUTION: STREAMING (NDJSON)
// ============================================================================

async function executeStreamingRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
  config: Pick<
    ApiCallConfig,
    | "signal"
    | "onStreamStart"
    | "onStreamEvent"
    | "onStreamComplete"
    | "onStreamError"
  >,
): Promise<ApiCallResult> {
  const { response } = await resilientFetch(
    url,
    {
      method,
      headers,
      body: JSON.stringify(body),
    },
    {
      signal: config.signal,
      connectTimeoutMs: 15_000,
      totalTimeoutMs: null,
      throwOnHttpError: false,
    },
  );

  if (!response.ok) {
    const serverDetail = await response.json().catch(() => undefined);
    const error: ApiCallError = {
      type: "http_error",
      message: `HTTP ${response.status}`,
      status: response.status,
      serverDetail,
    };
    config.onStreamError?.(error);
    return { error };
  }

  // Use the shared NDJSON stream parser.
  // requestId and conversationId are read synchronously from response headers —
  // they are available BEFORE any body events are consumed.
  const { events, requestId, conversationId } = parseNdjsonStream(
    response,
    config.signal ?? undefined,
  );

  // Fire immediately — headers arrive before the body, so this is the
  // earliest possible moment to capture conversationId (for URL updates, etc.).
  config.onStreamStart?.(requestId, conversationId);

  // Drain the async generator, handing each event to the caller
  for await (const event of events) {
    config.onStreamEvent?.(event);
  }

  config.onStreamComplete?.(requestId, conversationId);

  return {
    requestId: requestId ?? undefined,
    conversationId: conversationId ?? undefined,
  };
}

// ============================================================================
// SECTION 15 — THE MAIN THUNK CREATOR
// ============================================================================

/**
 * callApi — the single entry point for all Python FastAPI backend calls.
 *
 * Returns an AppThunk that:
 *   1. Waits for auth to be ready
 *   2. Resolves auth headers from Redux
 *   3. Resolves the backend URL from Redux (respecting admin localhost override)
 *   4. Resolves the context scope from Redux (user, org, project, task)
 *   5. Applies test overrides (if any)
 *   6. Executes the request — JSON or NDJSON streaming
 *
 * TypeScript enforces the correct body shape for every path/method combination
 * using the auto-generated types/python-generated/api-types.ts.
 *
 * Usage — from a component:
 * ```typescript
 * const dispatch = useAppDispatch();
 *
 * await dispatch(callApi({
 *   path: '/ai/agents/{agent_id}',
 *   method: 'POST',
 *   pathParams: { agent_id: promptId },
 *   body: { user_input: message, stream: true, debug: false, client_tools: [] },
 *   stream: true,
 *   onStreamEvent: (event) => handleEvent(event),
 *   onStreamComplete: (_, conversationId) => setConvId(conversationId),
 * }));
 * ```
 *
 * Usage — from another thunk:
 * ```typescript
 * return async (dispatch, getState) => {
 *   const result = await dispatch(callApi({ ... }));
 *   if (result.error) { ... }
 * };
 * ```
 */
export function callApi<
  P extends keyof paths,
  M extends HttpMethod = HttpMethod,
>(
  config: ApiCallConfig<P, M>,
): ThunkAction<Promise<ApiCallResult>, RootState, unknown, Action> {
  return async (_dispatch, getState) => {
    // ── Step 1: Wait for auth ─────────────────────────────────────────────
    await waitForAuthReady(getState);

    const state = getState();

    // ── Step 2: Resolve auth ──────────────────────────────────────────────
    const auth = resolveAuth(state);

    // ── Step 3: Resolve URL ───────────────────────────────────────────────
    const baseUrl = resolveBaseUrl(state, config._testOverrides);
    const url = buildUrl(
      baseUrl,
      config.path as string,
      config.pathParams as Record<string, string> | undefined,
      config.queryParams,
    );

    // ── Step 4: Resolve scope ─────────────────────────────────────────────
    const _scope = resolveScope(state, config.scopeOverrides);

    // ── Step 5: Assemble request body ─────────────────────────────────────
    const body = buildRequestBody(config.body, _scope);

    // ── Step 6: Apply test overrides ──────────────────────────────────────
    const headers = applyTestHeaders(auth.headers, config._testOverrides);
    maybeLogRequest(url, config.method, headers, body, config._testOverrides);

    // Short-circuit for mock responses (testing only)
    if (config._testOverrides?.mockResponse !== undefined) {
      return { data: config._testOverrides.mockResponse };
    }

    // ── Step 7: Execute ───────────────────────────────────────────────────
    try {
      if (config.stream) {
        return await executeStreamingRequest(
          url,
          config.method,
          headers,
          body,
          config,
        );
      } else {
        return await executeJsonRequest(
          url,
          config.method,
          headers,
          body,
          config.signal,
        );
      }
    } catch (err) {
      const error = normalizeError(err);
      if (config.onStreamError) config.onStreamError(error);
      return { error };
    }
  };
}

// ============================================================================
// SECTION 16 — TYPED CONVENIENCE WRAPPERS
// ============================================================================
//
// These wrappers narrow the generic callApi() to a specific endpoint,
// providing ergonomic call sites without needing to type the path every time.
//
// Pattern: one named export per important endpoint family.
// Add new ones here as we migrate callers from the old system.
//
// These are typed aliases — they carry the full body type inferrence.
// ─────────────────────────────────────────────────────────────────────────────

/** Body type for POST /ai/agents/{agent_id} */
export type AgentStartBody = components["schemas"]["AgentStartRequest"];

/** Body type for POST /ai/prompts/{prompt_id} */
export type PromptStartBody = components["schemas"]["PromptStartRequest"];

/** Body type for POST /ai/agents-blocks/{agent_id} */
export type AgentBlocksStartBody =
  components["schemas"]["AgentBlocksStartRequest"];

/** Body type for POST /ai/conversations/{conversation_id} */
export type ConversationContinueBody =
  components["schemas"]["ConversationContinueRequest"];

/** Body type for POST /ai/chat */
export type ChatBody = components["schemas"]["ChatRequest"];

/** LLM parameter overrides */
export type LLMParamsBody = components["schemas"]["LLMParams"];

// ─── Agent: Start new conversation ───────────────────────────────────────────

export interface CallAgentStartOptions {
  agentId: string;
  body: AgentStartBody;
  signal?: AbortSignal;
  scopeOverrides?: Partial<CallScope>;
  onStreamEvent?: (event: TypedStreamEvent) => void;
  onStreamComplete?: (
    requestId: string | null,
    conversationId: string | null,
  ) => void;
  onStreamError?: (error: ApiCallError) => void;
  _testOverrides?: TestOverrides;
}

export function callAgentStart(options: CallAgentStartOptions) {
  return callApi({
    path: "/ai/agents/{agent_id}",
    method: "POST",
    pathParams: { agent_id: options.agentId },
    body: options.body,
    stream: true,
    signal: options.signal,
    scopeOverrides: options.scopeOverrides,
    onStreamEvent: options.onStreamEvent,
    onStreamComplete: options.onStreamComplete,
    onStreamError: options.onStreamError,
    _testOverrides: options._testOverrides,
  });
}

// ─── Agent Blocks: Start new block-streaming conversation ────────────────────

export interface CallAgentBlocksStartOptions {
  agentId: string;
  body: AgentBlocksStartBody;
  signal?: AbortSignal;
  scopeOverrides?: Partial<CallScope>;
  onStreamEvent?: (event: TypedStreamEvent) => void;
  onStreamComplete?: (
    requestId: string | null,
    conversationId: string | null,
  ) => void;
  onStreamError?: (error: ApiCallError) => void;
  _testOverrides?: TestOverrides;
}

export function callAgentBlocksStart(options: CallAgentBlocksStartOptions) {
  return callApi({
    path: "/ai/agents-blocks/{agent_id}",
    method: "POST",
    pathParams: { agent_id: options.agentId },
    body: options.body,
    stream: true,
    signal: options.signal,
    scopeOverrides: options.scopeOverrides,
    onStreamEvent: options.onStreamEvent,
    onStreamComplete: options.onStreamComplete,
    onStreamError: options.onStreamError,
    _testOverrides: options._testOverrides,
  });
}

// ─── Conversation: Continue existing conversation ─────────────────────────────

export interface CallConversationContinueOptions {
  conversationId: string;
  body: ConversationContinueBody;
  signal?: AbortSignal;
  scopeOverrides?: Partial<CallScope>;
  onStreamEvent?: (event: TypedStreamEvent) => void;
  onStreamComplete?: (
    requestId: string | null,
    conversationId: string | null,
  ) => void;
  onStreamError?: (error: ApiCallError) => void;
  _testOverrides?: TestOverrides;
}

export function callConversationContinue(
  options: CallConversationContinueOptions,
) {
  return callApi({
    path: "/ai/conversations/{conversation_id}",
    method: "POST",
    pathParams: { conversation_id: options.conversationId },
    body: options.body,
    stream: true,
    signal: options.signal,
    scopeOverrides: options.scopeOverrides,
    onStreamEvent: options.onStreamEvent,
    onStreamComplete: options.onStreamComplete,
    onStreamError: options.onStreamError,
    _testOverrides: options._testOverrides,
  });
}

// ─── Cancel: Abort a running request ─────────────────────────────────────────

export function callCancelRequest(requestId: string) {
  return callApi({
    path: "/ai/cancel/{request_id}",
    method: "POST",
    pathParams: { request_id: requestId },
    stream: false,
  });
}

// ─── Warm-up: Pre-load agent into server cache ────────────────────────────────

/**
 * Valid `source` values for warm endpoints.
 * Tells the backend exactly which table to query:
 * - `"prompt"` → `prompts` table
 * - `"builtin"` → `prompt_builtins` table
 * - `"prompt_version"` → `prompt_versions` table
 * - `"builtin_version"` → `prompt_builtin_versions` table
 * - `undefined` → fallback chain (prompts → builtins)
 */
export type WarmSource =
  | "prompt"
  | "builtin"
  | "prompt_version"
  | "builtin_version";

export function callWarmAgent(agentId: string, source?: WarmSource) {
  return callApi({
    path: "/ai/agents/{agent_id}/warm",
    method: "POST",
    pathParams: { agent_id: agentId },
    body: (source ? { source } : undefined) as any,
    stream: false,
  });
}

export function callWarmConversation(conversationId: string) {
  return callApi({
    path: "/ai/conversations/{conversation_id}/warm",
    method: "POST",
    pathParams: { conversation_id: conversationId },
    stream: false,
  });
}

export function callWarmApp(appId: string) {
  return callApi({
    path: "/ai/apps/{app_id}/warm",
    method: "POST",
    pathParams: { app_id: appId },
    stream: false,
  });
}

// ─── Prompt: Start new conversation ──────────────────────────────────────────

export interface CallPromptStartOptions {
  promptId: string;
  body: PromptStartBody;
  signal?: AbortSignal;
  scopeOverrides?: Partial<CallScope>;
  onStreamStart?: (
    requestId: string | null,
    conversationId: string | null,
  ) => void;
  onStreamEvent?: (event: TypedStreamEvent) => void;
  onStreamComplete?: (
    requestId: string | null,
    conversationId: string | null,
  ) => void;
  onStreamError?: (error: ApiCallError) => void;
  _testOverrides?: TestOverrides;
}

export function callPromptStart(options: CallPromptStartOptions) {
  return callApi({
    path: "/ai/prompts/{prompt_id}",
    method: "POST",
    pathParams: { prompt_id: options.promptId },
    body: options.body,
    stream: true,
    signal: options.signal,
    scopeOverrides: options.scopeOverrides,
    onStreamStart: options.onStreamStart,
    onStreamEvent: options.onStreamEvent,
    onStreamComplete: options.onStreamComplete,
    onStreamError: options.onStreamError,
    _testOverrides: options._testOverrides,
  });
}

export function callWarmPrompt(promptId: string) {
  return callApi({
    path: "/ai/prompts/{prompt_id}/warm",
    method: "POST",
    pathParams: { prompt_id: promptId },
    stream: false,
  });
}

// ─── Conversation: Observational Memory cost summary ─────────────────────────
//
// Admin-only. Aggregates every `cx_observational_memory_event` row for the
// conversation and returns the authoritative totals + per-event-type
// breakdown. Non-admin callers receive 403 Forbidden from the backend;
// this helper exposes that as a typed ApiCallError, never throws.

export type MemoryCostSummary = components["schemas"]["MemoryCostSummary"];

export function callConversationMemoryCost(
  conversationId: string,
  options?: {
    signal?: AbortSignal;
    scopeOverrides?: Partial<CallScope>;
    _testOverrides?: TestOverrides;
  },
): ThunkAction<
  Promise<ApiCallResult<MemoryCostSummary>>,
  RootState,
  unknown,
  Action
> {
  return callApi({
    path: "/ai/conversations/{conversation_id}/memory_cost",
    method: "GET",
    pathParams: { conversation_id: conversationId },
    stream: false,
    signal: options?.signal,
    scopeOverrides: options?.scopeOverrides,
    _testOverrides: options?._testOverrides,
  }) as ThunkAction<
    Promise<ApiCallResult<MemoryCostSummary>>,
    RootState,
    unknown,
    Action
  >;
}

// ============================================================================
// SECTION 17 — CONVERSATION API (BATCH / FORK / COMPACTION)
// ============================================================================
//
// Wrappers for the new server-side conversation operations documented in
// docs/FE_CONVERSATION_API_CHANGES.md. These are ADDITIVE: they live alongside
// the existing direct-Supabase RPC thunks (forkConversation, deleteMessage,
// editMessage, etc.) so callers can opt in per surface without losing the
// existing implementation. Final consolidation can happen once the new
// endpoints are validated end-to-end in this codebase.

// ─── Conversation: Fork (extended) ───────────────────────────────────────────
//
// POST /cx/conversations/{id}/fork — copy a conversation up to a chosen point.
// Backwards-compatible extension of the legacy fork: now accepts
// `from_message_id` + `exclusive` in addition to `up_to_position`.

export type ConversationForkBody = components["schemas"]["ForkRequest"];
export type ConversationForkResponse =
  components["schemas"]["ForkConversationResponse"];

export interface CallConversationForkOptions {
  conversationId: string;
  body: ConversationForkBody;
  signal?: AbortSignal;
  scopeOverrides?: Partial<CallScope>;
  _testOverrides?: TestOverrides;
}

export function callConversationFork(
  options: CallConversationForkOptions,
): ThunkAction<
  Promise<ApiCallResult<ConversationForkResponse>>,
  RootState,
  unknown,
  Action
> {
  return callApi({
    path: "/cx/conversations/{conversation_id}/fork",
    method: "POST",
    pathParams: { conversation_id: options.conversationId },
    body: options.body,
    stream: false,
    signal: options.signal,
    scopeOverrides: options.scopeOverrides,
    _testOverrides: options._testOverrides,
  }) as ThunkAction<
    Promise<ApiCallResult<ConversationForkResponse>>,
    RootState,
    unknown,
    Action
  >;
}

// ─── Conversation: Fork-and-Run (streaming) ──────────────────────────────────
//
// POST /ai/conversations/{id}/fork-and-run — one-shot fork + new turn. The
// first NDJSON event is `kind: "conversation.forked"` (see
// `features/agents/types/conversation-stream-events.ts`), then standard agent
// stream output. This collapses the "edit a message → fork → continue" flow
// into a single atomic round trip.

export type ConversationForkAndRunBody =
  components["schemas"]["ForkAndRunRequest"];

export interface CallConversationForkAndRunOptions {
  conversationId: string;
  body: ConversationForkAndRunBody;
  signal?: AbortSignal;
  scopeOverrides?: Partial<CallScope>;
  onStreamStart?: (
    requestId: string | null,
    conversationId: string | null,
  ) => void;
  onStreamEvent?: (event: TypedStreamEvent) => void;
  onStreamComplete?: (
    requestId: string | null,
    conversationId: string | null,
  ) => void;
  onStreamError?: (error: ApiCallError) => void;
  _testOverrides?: TestOverrides;
}

export function callConversationForkAndRun(
  options: CallConversationForkAndRunOptions,
) {
  return callApi({
    path: "/ai/conversations/{conversation_id}/fork-and-run",
    method: "POST",
    pathParams: { conversation_id: options.conversationId },
    body: options.body,
    stream: true,
    signal: options.signal,
    scopeOverrides: options.scopeOverrides,
    onStreamStart: options.onStreamStart,
    onStreamEvent: options.onStreamEvent,
    onStreamComplete: options.onStreamComplete,
    onStreamError: options.onStreamError,
    _testOverrides: options._testOverrides,
  });
}

// ─── Messages: Batch delete with tool-pair cascade ───────────────────────────
//
// POST /cx/conversations/{id}/messages/delete — hard delete. Smarter than the
// per-row legacy path: keeps tool_use / tool_result adjacency intact so the
// next provider call never sees an orphan tool block. Pass `dry_run: true` to
// preview the resolved set without writing.

export type MessageSelector = components["schemas"]["MessageSelector"];
export type BatchDeleteBody = components["schemas"]["BatchDeleteRequest"];
export type BatchDeleteResult = components["schemas"]["BatchDeleteResponse"];

export interface CallBatchDeleteMessagesOptions {
  conversationId: string;
  body: BatchDeleteBody;
  signal?: AbortSignal;
  scopeOverrides?: Partial<CallScope>;
  _testOverrides?: TestOverrides;
}

export function callBatchDeleteMessages(
  options: CallBatchDeleteMessagesOptions,
): ThunkAction<
  Promise<ApiCallResult<BatchDeleteResult>>,
  RootState,
  unknown,
  Action
> {
  return callApi({
    path: "/cx/conversations/{conversation_id}/messages/delete",
    method: "POST",
    pathParams: { conversation_id: options.conversationId },
    body: options.body,
    stream: false,
    signal: options.signal,
    scopeOverrides: options.scopeOverrides,
    _testOverrides: options._testOverrides,
  }) as ThunkAction<
    Promise<ApiCallResult<BatchDeleteResult>>,
    RootState,
    unknown,
    Action
  >;
}

// ─── Messages: Replace (user-initiated compaction) ───────────────────────────
//
// POST /cx/conversations/{id}/messages/replace — soft-delete the selected
// rows and insert a single visible summary message in their place. Reversible
// via /messages/restore using the returned `compaction_group_id`.

export type ReplaceMessagesBody = components["schemas"]["ReplaceRequest"];
export type ReplaceMessagesResult = components["schemas"]["ReplaceResponse"];

export interface CallReplaceMessagesOptions {
  conversationId: string;
  body: ReplaceMessagesBody;
  signal?: AbortSignal;
  scopeOverrides?: Partial<CallScope>;
  _testOverrides?: TestOverrides;
}

export function callReplaceMessages(
  options: CallReplaceMessagesOptions,
): ThunkAction<
  Promise<ApiCallResult<ReplaceMessagesResult>>,
  RootState,
  unknown,
  Action
> {
  return callApi({
    path: "/cx/conversations/{conversation_id}/messages/replace",
    method: "POST",
    pathParams: { conversation_id: options.conversationId },
    body: options.body,
    stream: false,
    signal: options.signal,
    scopeOverrides: options.scopeOverrides,
    _testOverrides: options._testOverrides,
  }) as ThunkAction<
    Promise<ApiCallResult<ReplaceMessagesResult>>,
    RootState,
    unknown,
    Action
  >;
}

// ─── Messages: Hide (system-initiated compaction) ────────────────────────────
//
// POST /cx/conversations/{id}/messages/hide — flip `is_visible_to_model=false`
// on the selected rows. User still sees them; nothing is soft-deleted;
// positions don't move. Reversible via /messages/restore.

export type HideMessagesBody = components["schemas"]["HideRequest"];
export type HideMessagesResult = components["schemas"]["HideResponse"];

export interface CallHideMessagesOptions {
  conversationId: string;
  body: HideMessagesBody;
  signal?: AbortSignal;
  scopeOverrides?: Partial<CallScope>;
  _testOverrides?: TestOverrides;
}

export function callHideMessages(
  options: CallHideMessagesOptions,
): ThunkAction<
  Promise<ApiCallResult<HideMessagesResult>>,
  RootState,
  unknown,
  Action
> {
  return callApi({
    path: "/cx/conversations/{conversation_id}/messages/hide",
    method: "POST",
    pathParams: { conversation_id: options.conversationId },
    body: options.body,
    stream: false,
    signal: options.signal,
    scopeOverrides: options.scopeOverrides,
    _testOverrides: options._testOverrides,
  }) as ThunkAction<
    Promise<ApiCallResult<HideMessagesResult>>,
    RootState,
    unknown,
    Action
  >;
}

// ─── Messages: Restore (undo a replace or hide) ──────────────────────────────
//
// POST /cx/conversations/{id}/messages/restore — reverse a previous
// /messages/replace or /messages/hide. Identify the op via either
// `compaction_group_id` or `summary_message_id` (replace only).
//
// NOTE the response schema is namespaced — there's an unrelated
// `RestoreResponse` in the file_analysis router. The generated `paths`
// already resolves to the right one; the typed return below points at the
// namespaced schema for callers that want to type it explicitly.

export type RestoreCompactionBody = components["schemas"]["RestoreRequest"];
export type RestoreCompactionResult =
  components["schemas"]["aidream__api__routers__cx_data__RestoreResponse"];

export interface CallRestoreCompactionOptions {
  conversationId: string;
  body: RestoreCompactionBody;
  signal?: AbortSignal;
  scopeOverrides?: Partial<CallScope>;
  _testOverrides?: TestOverrides;
}

export function callRestoreCompaction(
  options: CallRestoreCompactionOptions,
): ThunkAction<
  Promise<ApiCallResult<RestoreCompactionResult>>,
  RootState,
  unknown,
  Action
> {
  return callApi({
    path: "/cx/conversations/{conversation_id}/messages/restore",
    method: "POST",
    pathParams: { conversation_id: options.conversationId },
    body: options.body,
    stream: false,
    signal: options.signal,
    scopeOverrides: options.scopeOverrides,
    _testOverrides: options._testOverrides,
  }) as ThunkAction<
    Promise<ApiCallResult<RestoreCompactionResult>>,
    RootState,
    unknown,
    Action
  >;
}

// ─── Turns: Compact one or more whole turns ──────────────────────────────────
//
// POST /cx/conversations/{id}/turns/compact — turn = role:"user" → next
// role:"user" (exclusive). Server resolves the turn boundary and delegates to
// /messages/replace (mode="user") or /messages/hide (mode="system"). Caller
// supplies the summary content; this endpoint does not run an LLM.

export type CompactTurnsBody = components["schemas"]["CompactTurnsRequest"];
export type CompactTurnsResult = components["schemas"]["CompactTurnsResponse"];

export interface CallCompactTurnsOptions {
  conversationId: string;
  body: CompactTurnsBody;
  signal?: AbortSignal;
  scopeOverrides?: Partial<CallScope>;
  _testOverrides?: TestOverrides;
}

export function callCompactTurns(
  options: CallCompactTurnsOptions,
): ThunkAction<
  Promise<ApiCallResult<CompactTurnsResult>>,
  RootState,
  unknown,
  Action
> {
  return callApi({
    path: "/cx/conversations/{conversation_id}/turns/compact",
    method: "POST",
    pathParams: { conversation_id: options.conversationId },
    body: options.body,
    stream: false,
    signal: options.signal,
    scopeOverrides: options.scopeOverrides,
    _testOverrides: options._testOverrides,
  }) as ThunkAction<
    Promise<ApiCallResult<CompactTurnsResult>>,
    RootState,
    unknown,
    Action
  >;
}

// ─── TODO: Add more wrappers as callers are migrated ─────────────────────────
// callChat(...)
// callDirectChat(...)
// callSubmitToolResults(...)
// callScrape(...)
// callResearch(...)
// callPdfExtract(...)
// callBlockProcess(...)
