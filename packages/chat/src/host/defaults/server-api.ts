/**
 * The package's own server client (PACKAGE-INDEPENDENCE §2.1, slice P9) — what
 * a host that supplies no `server.api` gets. Every call rides the shared
 * transport in `@ai-matrx/agents/matrx` over the server port's `baseUrl()` and
 * `headers()` (bearer + active organization), so a bare host given only a
 * Supabase client reaches the AI Matrx server.
 *
 * matrx-frontend never runs this: it registers and supplies its own `lib/api`
 * (`lib/api/chat-server-api.ts`). Host-only features have honest absent
 * values here — no admin lane, no admin door, no endpoint overrides, no local
 * engine, no browser extension (each refusal says so once).
 */

import {
  MatrxApiError,
  applyOrganizationContextHeader,
  buildMatrxRequestBody,
  buildMatrxRequestUrl,
  cancelAgentRun,
  createMatrxTransport as createPackageTransport,
  executeMatrxCall,
  normalizeMatrxError,
  parseMatrxNdjsonResponse,
  reportProviderSessionFailure,
  type MatrxCallError,
  type MatrxCallResult,
  type MatrxCancelResponse,
  type MatrxTransport,
  type ProviderSessionFailure,
  type ProviderSessionFailureVerdict,
} from "@ai-matrx/agents/matrx";
import type { MatrxStreamEnvelope } from "@ai-matrx/agents/stream/ndjson";
import type {
  ChatIdentityPort,
  ChatOrgPort,
  ChatServerPort,
} from "../contract";
import { announceOnce } from "../errors";

// ── Types (what an unregistered host's package code is written against) ─────

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type AnyGetState = () => unknown;
type AnyDispatch = (action: never) => unknown;
/** A thunk any Redux store with redux-thunk runs. */
export type DefaultServerThunk<R> = (
  dispatch: AnyDispatch,
  getState: AnyGetState,
  extra: unknown,
) => R;

/** The ONE classified call error (`MatrxCallError`, `@ai-matrx/agents/matrx`). */
export type DefaultApiCallError = MatrxCallError;

/** The call result (`MatrxCallResult`, `@ai-matrx/agents/matrx`). */
export type DefaultApiCallResult<T = unknown> = MatrxCallResult<T>;

export interface DefaultCallScope {
  organization_id?: string;
  project_id?: string;
  task_id?: string;
  conversation_id?: string;
}

export interface DefaultApiCallConfig {
  path: string;
  method: HttpMethod;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string | number | boolean>;
  expectedErrorStatuses?: readonly number[];
  body?: unknown;
  stream?: boolean;
  onStreamStart?: (requestId: string | null, conversationId: string | null) => void;
  onStreamEvent?: (event: MatrxStreamEnvelope) => void;
  consumeStream?: (
    response: Response,
    ids: { requestId: string | null; conversationId: string | null },
  ) => Promise<void>;
  onStreamComplete?: (requestId: string | null, conversationId: string | null) => void;
  onStreamError?: (error: DefaultApiCallError) => void;
  signal?: AbortSignal;
  scopeOverrides?: Partial<DefaultCallScope>;
  organizationFreeRead?: true;
  interactiveOrganization?: boolean;
}

/** The request/response types of the default client. */
export interface DefaultChatServerTypes {
  ApiCallError: DefaultApiCallError;
  ApiCallResult: DefaultApiCallResult;
  CallScope: DefaultCallScope;
  LLMParams: Record<string, unknown>;
  LLMParamsBody: Record<string, unknown>;
  MemoryCostSummary: Record<string, unknown>;
  MessageSelector: Record<string, unknown>;
  BatchDeleteResult: Record<string, unknown>;
  ReplaceMessagesResult: Record<string, unknown>;
  HideMessagesResult: Record<string, unknown>;
  RestoreCompactionResult: Record<string, unknown>;
  CompactTurnsResult: Record<string, unknown>;
  ConversationForkBody: Record<string, unknown>;
  ConversationForkAndRunBody: Record<string, unknown>;
  MatrxTransportOptions: { expectedErrorStatuses?: readonly number[]; source?: string };
  OrganizationAdmission: "ready" | "unresolved" | "timed-out" | "unavailable";
}

export interface DefaultLocalEngine {
  url: string;
  capabilities?: readonly string[];
}

interface ServerHostView {
  server: ChatServerPort;
  identity: ChatIdentityPort;
  org: ChatOrgPort;
}

// ── Small pure helpers ───────────────────────────────────────────────────────

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function fillPath(template: string, params?: Record<string, string | number>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = params?.[key];
    if (value === undefined) {
      throw new Error(`Missing path parameter "${key}" for "${template}".`);
    }
    return encodeURIComponent(String(value));
  });
}

function withQuery(
  path: string,
  query?: Record<string, string | number | boolean | null | undefined | readonly unknown[]>,
): string {
  if (!query) return path;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item === null || item === undefined || item === "") continue;
      qs.append(key, String(item));
    }
  }
  const text = qs.toString();
  return text ? `${path}${path.includes("?") ? "&" : "?"}${text}` : path;
}

async function errorFromResponse(response: Response, path: string): Promise<MatrxApiError> {
  let serverDetail: unknown;
  try {
    serverDetail = await response.json();
  } catch {
    serverDetail = undefined;
  }
  return new MatrxApiError({ status: response.status, path, serverDetail });
}

function unhosted(feature: string): void {
  announceOnce(
    `server-unhosted-${feature}`,
    `${feature} is not available in this host. Supply \`server.api\` on the chat host to enable it.`,
    "warn",
  );
}

// ── The client ───────────────────────────────────────────────────────────────

export function createDefaultServerApi(host: () => ServerHostView) {
  const baseUrl = () => trimSlash(host().server.baseUrl());
  const policyHeaders = async (): Promise<Record<string, string>> =>
    (await host().server.headers?.()) ?? {};

  async function send(
    method: HttpMethod,
    path: string,
    init: { body?: unknown; signal?: AbortSignal; accept?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      Accept: init.accept ?? "application/json",
      ...(await policyHeaders()),
    };
    const response = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      ...(init.signal ? { signal: init.signal } : {}),
    });
    if (!response.ok) throw await errorFromResponse(response, path);
    return response;
  }

  async function json<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    opts: { signal?: AbortSignal } = {},
  ): Promise<{ data: T; meta: { requestId: string | null; status: number } }> {
    const response = await send(method, path, {
      ...(body !== undefined ? { body } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    const data = (response.status === 204 ? null : await response.json()) as T;
    return { data, meta: { requestId: response.headers.get("X-Request-ID"), status: response.status } };
  }

  function resolveScope(
    _state?: unknown,
    overrides?: Partial<DefaultCallScope>,
  ): DefaultCallScope {
    const active = host().org.active();
    return {
      ...(active ? { organization_id: active.id } : {}),
      ...(overrides ?? {}),
    };
  }

  function buildRequestBody(body: unknown, scope: DefaultCallScope): Record<string, unknown> {
    return buildMatrxRequestBody(body, scope);
  }

  function callApi(config: DefaultApiCallConfig): DefaultServerThunk<Promise<DefaultApiCallResult>> {
    // THE shared request pipeline (`@ai-matrx/agents/matrx` `call`, P9b) — the
    // same one matrx-frontend's `lib/api` `callApi` runs; this host supplies
    // only its base URL and policy headers.
    return async () => {
      try {
        const scope = resolveScope(undefined, config.scopeOverrides);
        return await executeMatrxCall({
          url: buildMatrxRequestUrl(baseUrl(), config.path, config.pathParams, config.queryParams),
          method: config.method,
          headers: {
            "Content-Type": "application/json",
            Accept: config.stream ? "application/x-ndjson" : "application/json",
            ...(await policyHeaders()),
          },
          body: buildMatrxRequestBody(config.body, scope),
          stream: !!config.stream,
          ...(config.signal ? { signal: config.signal } : {}),
          ...(config.onStreamStart ? { onStreamStart: config.onStreamStart } : {}),
          ...(config.onStreamEvent ? { onStreamEvent: config.onStreamEvent } : {}),
          ...(config.consumeStream ? { consumeStream: config.consumeStream } : {}),
          ...(config.onStreamComplete ? { onStreamComplete: config.onStreamComplete } : {}),
          ...(config.onStreamError ? { onStreamError: config.onStreamError } : {}),
        });
      } catch (error) {
        const callError = normalizeMatrxError(error);
        if (config.stream) config.onStreamError?.(callError);
        return { error: callError };
      }
    };
  }

  const call =
    (method: HttpMethod, path: string, stream = false) =>
    (options: {
      conversationId: string;
      body?: unknown;
      signal?: AbortSignal;
      scopeOverrides?: Partial<DefaultCallScope>;
      onStreamStart?: DefaultApiCallConfig["onStreamStart"];
      onStreamEvent?: DefaultApiCallConfig["onStreamEvent"];
      onStreamComplete?: DefaultApiCallConfig["onStreamComplete"];
      onStreamError?: DefaultApiCallConfig["onStreamError"];
    }) =>
      callApi({
        path,
        method,
        pathParams: { conversation_id: options.conversationId },
        body: options.body,
        stream,
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.scopeOverrides ? { scopeOverrides: options.scopeOverrides } : {}),
        ...(options.onStreamStart ? { onStreamStart: options.onStreamStart } : {}),
        ...(options.onStreamEvent ? { onStreamEvent: options.onStreamEvent } : {}),
        ...(options.onStreamComplete ? { onStreamComplete: options.onStreamComplete } : {}),
        ...(options.onStreamError ? { onStreamError: options.onStreamError } : {}),
      });

  function transport(options: { organizationId?: string; source?: string; expectedErrorStatuses?: readonly number[] } = {}): MatrxTransport {
    return createPackageTransport({
      resolveTarget: () => ({ baseUrl: baseUrl() }),
      credentials: {
        get: async () => {
          const accessToken = await host().identity.getAccessToken();
          return accessToken ? { kind: "user", accessToken } : null;
        },
      },
      organizationId: () => options.organizationId ?? host().org.active()?.id ?? null,
      ...(options.source ? { source: options.source } : {}),
      ...(options.expectedErrorStatuses
        ? { expectedErrorStatuses: options.expectedErrorStatuses }
        : {}),
    });
  }

  const productionUrl = () => baseUrl();

  return {
    // call-api
    callApi,
    resolveScope,
    buildRequestBody,
    waitForAuthReady: async (_getState?: AnyGetState): Promise<boolean> => true,
    callConversationMemoryCost: (
      conversationId: string,
      options?: { signal?: AbortSignal; scopeOverrides?: Partial<DefaultCallScope> },
    ) =>
      callApi({
        path: "/ai/conversations/{conversation_id}/memory_cost",
        method: "GET",
        pathParams: { conversation_id: conversationId },
        stream: false,
        ...(options?.signal ? { signal: options.signal } : {}),
        ...(options?.scopeOverrides ? { scopeOverrides: options.scopeOverrides } : {}),
      }),
    callConversationFork: call("POST", "/cx/conversations/{conversation_id}/fork"),
    callConversationForkAndRun: call("POST", "/ai/conversations/{conversation_id}/fork-and-run", true),
    callBatchDeleteMessages: call("POST", "/cx/conversations/{conversation_id}/messages/delete"),
    callReplaceMessages: call("POST", "/cx/conversations/{conversation_id}/messages/replace"),
    callHideMessages: call("POST", "/cx/conversations/{conversation_id}/messages/hide"),
    callRestoreCompaction: call("POST", "/cx/conversations/{conversation_id}/messages/restore"),
    callCompactTurns: call("POST", "/cx/conversations/{conversation_id}/compact"),

    // matrx-transport
    createMatrxTransport: (
      _getState?: AnyGetState,
      options: { organizationId?: string; source?: string; expectedErrorStatuses?: readonly number[] } = {},
    ): MatrxTransport => transport(options),
    createMatrxTransportFromTarget: (
      getState: AnyGetState,
      resolveTarget: (state: never) => { baseUrl: string; policyHeaders: Record<string, string>; channel: string },
      options: { source?: string; expectedErrorStatuses?: readonly number[] } = {},
    ): MatrxTransport =>
      createPackageTransport({
        resolveTarget: () => resolveTarget(getState() as never),
        ...(options.source ? { source: options.source } : {}),
        ...(options.expectedErrorStatuses
          ? { expectedErrorStatuses: options.expectedErrorStatuses }
          : {}),
      }),
    cancelAgentRunRequest:
      (
        requestId: string,
        mode: "cancel" | "interrupt" = "cancel",
        seenSeq?: number,
      ): DefaultServerThunk<Promise<DefaultApiCallResult<MatrxCancelResponse>>> =>
      async () => {
        const base = transport();
        const sender: MatrxTransport =
          seenSeq === undefined
            ? base
            : {
                fetch: (path, init) =>
                  base.fetch(`${path}${path.includes("?") ? "&" : "?"}seen_seq=${seenSeq}`, init),
              };
        try {
          const data = await cancelAgentRun(sender, requestId, { mode });
          return { data, requestId: data.request_id };
        } catch (error) {
          return { error: normalizeMatrxError(error) };
        }
      },

    // organization admission + the admin seat (none in a bare host)
    peekSelectedOrganizationId: (): string | null => host().org.active()?.id ?? null,
    waitForOrganizationAdmission: async (): Promise<DefaultChatServerTypes["OrganizationAdmission"]> =>
      host().org.active() ? "ready" : "unresolved",
    adminLaneOrganizationId: (): string | null => null,
    adminLaneHeadersFor: (_organizationId: string | null | undefined): Record<string, string> => ({}),
    applyOrganizationContextHeader,
    adminDoorOpen: (): boolean => false,

    // context state (cold start)
    fetchContextState:
      (args: { conversationId: string; signal?: AbortSignal }): DefaultServerThunk<Promise<unknown>> =>
      async () =>
        (await json<unknown>("GET", `/cx/conversations/${encodeURIComponent(args.conversationId)}/context-state`, undefined, args.signal ? { signal: args.signal } : {})).data,

    // typed client + python client
    buildPath: (template: string, params: Record<string, string | number>): string =>
      fillPath(template, params),
    apiGet: <T = unknown>(
      path: string,
      opts?: { signal?: AbortSignal; query?: Record<string, string | number | boolean | null | undefined | readonly unknown[]> },
    ) => json<T>("GET", withQuery(path, opts?.query), undefined, opts?.signal ? { signal: opts.signal } : {}),
    apiPost: <T = unknown>(path: string, body: unknown, opts?: { signal?: AbortSignal }) =>
      json<T>("POST", path, body, opts?.signal ? { signal: opts.signal } : {}),
    apiPatch: <T = unknown>(path: string, body: unknown, opts?: { signal?: AbortSignal }) =>
      json<T>("PATCH", path, body, opts?.signal ? { signal: opts.signal } : {}),
    postJson: <T = unknown>(path: string, body: unknown, opts?: { signal?: AbortSignal }) =>
      json<T>("POST", path, body, opts?.signal ? { signal: opts.signal } : {}),
    getAccessTokenOrNull: (): Promise<string | null> => host().identity.getAccessToken(),
    resolveBaseUrl: (override?: string): string => (override ? trimSlash(override) : baseUrl()),
    productionUrl,

    // credentials broker + browser-held provider sessions
    mintCredential: (
      audience: string,
      tierPolicy: unknown,
      opts: { model?: string; scopes?: string[]; ttlSeconds?: number; signal?: AbortSignal } = {},
    ) =>
      json<unknown>(
        "POST",
        "/broker/tokens",
        {
          audience,
          tier_policy: tierPolicy,
          ttl_seconds: opts.ttlSeconds ?? null,
          model: opts.model ?? null,
          scopes: opts.scopes ?? [],
        },
        opts.signal ? { signal: opts.signal } : {},
      ).then((result) => result.data),
    reportBrowserProviderFailure:
      (failure: ProviderSessionFailure): DefaultServerThunk<Promise<ProviderSessionFailureVerdict | null>> =>
      async () => {
        try {
          return await reportProviderSessionFailure(transport({ source: "providerSessionFailure" }), failure);
        } catch (error) {
          console.warn(`[provider-session-failure] could not report a ${failure.provider} failure`, error);
          return null;
        }
      },

    // the NDJSON stream every run reads
    // THE shared parser: a body that breaks mid-run is a TRANSPORT loss (the
    // run may still finish and is reattachable), never a failed run.
    parseNdjsonStream: (response: Response, signal?: AbortSignal) =>
      parseMatrxNdjsonResponse(response, signal),

    // the server selection (no admin server switcher in a bare host)
    selectResolvedBaseUrl: (_state: unknown): string | undefined => baseUrl(),
    selectActiveServer: (_state: unknown): string => "production",
    selectActiveServerHealth: (_state: unknown): null => null,
    selectAiApiVersion: (_state: unknown): "v1" | "v2" => "v2",
    selectApiVersion: (_state: unknown): string | null => null,
    selectPathOverrides: (_state: unknown): Record<string, string> => ({}),
    selectEndpointOverrideConfig: (_state: unknown): null => null,
    selectLoopbackTargetsAllowed: (_state: unknown): boolean => false,
    switchServer: (_payload: unknown) => {
      unhosted("Switching servers");
      return { type: "chatHost/serverSwitchUnavailable" };
    },
    setAiApiVersion: (_version: unknown) => ({ type: "chatHost/aiApiVersionUnavailable" }),
    setApiVersion: (_version: unknown) => ({ type: "chatHost/apiVersionUnavailable" }),
    setPathOverride: (_payload: unknown) => ({ type: "chatHost/pathOverrideUnavailable" }),
    clearApiOverrides: () => ({ type: "chatHost/apiOverridesUnavailable" }),

    // a matrx-local engine on this machine, and the browser extension (neither here)
    getCachedLocalEngine: (): DefaultLocalEngine | null => null,
    discoverLocalEngine: async (_options?: unknown): Promise<DefaultLocalEngine | null> => null,
    supportsLocalAgentExecution: (_engine: DefaultLocalEngine): boolean => false,
    invokeMatrxExtendTool: async (..._args: unknown[]): Promise<never> => {
      unhosted("The browser extension");
      throw new Error(
        "The Matrx browser extension is not reachable from this app. Supply `server.api` on the chat host to enable it.",
      );
    },
  };
}

export type DefaultChatServerApi = ReturnType<typeof createDefaultServerApi>;
