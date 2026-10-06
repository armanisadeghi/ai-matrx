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
  sendMatrxRequest,
  type MatrxQueryParams,
} from "@ai-matrx/agents/matrx";
import type { MatrxStreamEnvelope } from "@ai-matrx/agents/stream/ndjson";
import type { TypedStreamEvent } from "@ai-matrx/agents/generated/stream-events";
import type {
  ApiPaths,
  ApiSchemas as Schemas,
  DefaultBrokeredCredential,
  DefaultRequestOptions,
  GetResult,
  PatchBody,
  PatchResult,
  PathWith,
  PostBody,
  PostResult,
} from "./typed-paths";
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
  onStreamEvent?: (event: TypedStreamEvent) => void;
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
  /** Abort the connect phase after this many ms (the stream itself is unbounded). */
  connectTimeoutMs?: number;
  /** Abort the whole call after this many ms. */
  totalTimeoutMs?: number | null;
}

/** The request/response types of the default client. */
export interface DefaultChatServerTypes {
  ApiCallError: DefaultApiCallError;
  ApiCallResult: DefaultApiCallResult;
  CallScope: DefaultCallScope;
  LLMParams: Schemas["LLMParams"];
  LLMParamsBody: Schemas["LLMParams"];
  MemoryCostSummary: Schemas["MemoryCostSummary"];
  MessageSelector: Schemas["MessageSelector"];
  BatchDeleteResult: Schemas["BatchDeleteResponse"];
  ReplaceMessagesResult: Schemas["ReplaceResponse"];
  HideMessagesResult: Schemas["HideResponse"];
  RestoreCompactionResult: Schemas["aidream__services__conversation_context__compaction__RestoreResponse"];
  CompactTurnsResult: Schemas["CompactTurnsResponse"];
  ConversationForkBody: Schemas["ForkRequest"];
  ConversationForkAndRunBody: Schemas["ForkAndRunRequest"];
  MatrxTransportOptions: { expectedErrorStatuses?: readonly number[]; source?: string };
  OrganizationAdmission: "ready" | "unresolved" | "timed-out" | "unavailable";
}

/** What one browser-extension tool call answered (the app's `MatrxExtendInvocation`). */
export type DefaultMatrxExtendInvocation =
  | { handled: false; reason: string }
  | { handled: true; ok: true; output: Record<string, unknown> }
  | { handled: true; ok: false; error: string };

export interface DefaultLocalEngine {
  /** e.g. "http://127.0.0.1:22140" — no trailing slash. */
  baseUrl: string;
  capabilities?: readonly string[];
}

/** No health probe in a bare host; one stable object so selectors never re-render on it. */
const UNKNOWN_SERVER_HEALTH: { readonly status: "unknown"; readonly latencyMs: number | null } = Object.freeze({
  status: "unknown",
  latencyMs: null,
});

interface ServerHostView {
  server: ChatServerPort;
  identity: ChatIdentityPort;
  org: ChatOrgPort;
}

// ── Small pure helpers ───────────────────────────────────────────────────────

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** A path template filled from its params (a missing param refuses loudly). */
function fillPath(template: string, params?: Record<string, string | number>): string {
  const missing = [...template.matchAll(/\{([^}]+)\}/g)]
    .map((m) => m[1])
    .filter((key) => params?.[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing path parameter "${missing[0]}" for "${template}".`);
  }
  return buildMatrxRequestUrl(
    "",
    template,
    Object.fromEntries(Object.entries(params ?? {}).map(([k, v]) => [k, String(v)])),
  );
}

/** The bare host's query shape for the core builder ("" means "not set"). */
function queryParams(
  query: Record<string, string | number | boolean | null | undefined | readonly unknown[]>,
): MatrxQueryParams {
  const out: MatrxQueryParams = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === "") continue;
    out[key] = Array.isArray(value)
      ? value
          .filter((v) => v !== null && v !== undefined && v !== "")
          .map((v) => String(v))
      : (value as MatrxQueryParams[string]);
  }
  return out;
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
    init: {
      body?: unknown;
      signal?: AbortSignal;
      accept?: string;
      query?: MatrxQueryParams;
    } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      Accept: init.accept ?? "application/json",
      ...(await policyHeaders()),
    };
    // THE shared request pipeline (`@ai-matrx/agents/matrx`): URL and send.
    const response = await sendMatrxRequest(
      buildMatrxRequestUrl(baseUrl(), path, undefined, init.query),
      {
        method,
        headers,
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      },
      init.signal ? { signal: init.signal } : {},
    );
    if (!response.ok) throw await errorFromResponse(response, path);
    return response;
  }

  async function json<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    opts: { signal?: AbortSignal; query?: MatrxQueryParams } = {},
  ): Promise<{ data: T; meta: { requestId: string | null; status: number } }> {
    const response = await send(method, path, {
      ...(body !== undefined ? { body } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
      ...(opts.query ? { query: opts.query } : {}),
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

  function callApi<T = unknown>(config: DefaultApiCallConfig): DefaultServerThunk<Promise<DefaultApiCallResult<T>>> {
    // THE shared request pipeline (`@ai-matrx/agents/matrx` `call`, P9b) — the
    // same one matrx-frontend's `lib/api` `callApi` runs; this host supplies
    // only its base URL and policy headers.
    return async () => {
      try {
        const scope = resolveScope(undefined, config.scopeOverrides);
        return (await executeMatrxCall({
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
          ...(config.onStreamEvent
            ? { onStreamEvent: config.onStreamEvent as (event: MatrxStreamEnvelope) => void }
            : {}),
          ...(config.consumeStream ? { consumeStream: config.consumeStream } : {}),
          ...(config.onStreamComplete ? { onStreamComplete: config.onStreamComplete } : {}),
          ...(config.onStreamError ? { onStreamError: config.onStreamError } : {}),
        })) as DefaultApiCallResult<T>;
      } catch (error) {
        const callError = normalizeMatrxError(error);
        if (config.stream) config.onStreamError?.(callError);
        return { error: callError };
      }
    };
  }

  const call =
    <R = unknown>(method: HttpMethod, path: string, stream = false) =>
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
      callApi<R>({
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
      callApi<Schemas["MemoryCostSummary"]>({
        path: "/ai/conversations/{conversation_id}/memory_cost",
        method: "GET",
        pathParams: { conversation_id: conversationId },
        stream: false,
        ...(options?.signal ? { signal: options.signal } : {}),
        ...(options?.scopeOverrides ? { scopeOverrides: options.scopeOverrides } : {}),
      }),
    callConversationFork: call<Schemas["ForkConversationResponse"]>("POST", "/cx/conversations/{conversation_id}/fork"),
    callConversationForkAndRun: call<unknown>("POST", "/ai/conversations/{conversation_id}/fork-and-run", true),
    callBatchDeleteMessages: call<Schemas["BatchDeleteResponse"]>("POST", "/cx/conversations/{conversation_id}/messages/delete"),
    callReplaceMessages: call<Schemas["ReplaceResponse"]>("POST", "/cx/conversations/{conversation_id}/messages/replace"),
    callHideMessages: call<Schemas["HideResponse"]>("POST", "/cx/conversations/{conversation_id}/messages/hide"),
    callRestoreCompaction: call<Schemas["aidream__services__conversation_context__compaction__RestoreResponse"]>("POST", "/cx/conversations/{conversation_id}/messages/restore"),
    callCompactTurns: call<Schemas["CompactTurnsResponse"]>("POST", "/cx/conversations/{conversation_id}/compact"),

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
      (args: {
        conversationId: string;
        signal?: AbortSignal;
      }): DefaultServerThunk<Promise<unknown> & { unwrap: () => Promise<unknown> }> =>
      () => {
        // Same shape as the app's async thunk: the dispatched value is a promise with `unwrap()`.
        const pending = json<unknown>(
          "GET",
          `/cx/conversations/${encodeURIComponent(args.conversationId)}/context-state`,
          undefined,
          args.signal ? { signal: args.signal } : {},
        ).then((result) => result.data);
        return Object.assign(pending, { unwrap: () => pending });
      },

    // typed client + python client
    buildPath: <P extends keyof ApiPaths>(template: P, params: Record<string, string | number>): P =>
      fillPath(template as string, params) as P,
    apiGet: <P extends PathWith<"get">>(
      path: P,
      opts?: DefaultRequestOptions & {
        query?: Record<string, string | number | boolean | null | undefined | readonly unknown[]>;
      },
    ) =>
      json<GetResult<P>>("GET", path, undefined, {
        ...(opts?.signal ? { signal: opts.signal } : {}),
        ...(opts?.query ? { query: queryParams(opts.query) } : {}),
      }),
    apiPost: <P extends PathWith<"post">>(
      path: P,
      body: PostBody<P> extends never ? undefined : PostBody<P>,
      opts?: DefaultRequestOptions,
    ) => json<PostResult<P>>("POST", path, body, opts?.signal ? { signal: opts.signal } : {}),
    apiPatch: <P extends PathWith<"patch">>(path: P, body: PatchBody<P>, opts?: DefaultRequestOptions) =>
      json<PatchResult<P>>("PATCH", path, body, opts?.signal ? { signal: opts.signal } : {}),
    postJson: <T, B = unknown>(path: string, body: B, opts?: DefaultRequestOptions) =>
      json<T>("POST", path, body, opts?.signal ? { signal: opts.signal } : {}),
    requestRaw: async (
      path: string,
      init: RequestInit = {},
      opts: { allowHttpError?: boolean; expectedErrorStatuses?: readonly number[]; organizationId?: string; signal?: AbortSignal } = {},
    ): Promise<Response> => {
      const response = await sendMatrxRequest(
        buildMatrxRequestUrl(baseUrl(), path),
        { ...init, headers: { ...(await policyHeaders()), ...(init.headers as Record<string, string> | undefined) } },
        opts.signal ? { signal: opts.signal } : {},
      );
      if (!response.ok && !opts.allowHttpError) throw await errorFromResponse(response, path);
      return response;
    },
    getAccessTokenOrNull: (): Promise<string | null> => host().identity.getAccessToken(),
    resolveBaseUrl: (override?: string): string => (override ? trimSlash(override) : baseUrl()),
    productionUrl,

    // credentials broker + browser-held provider sessions
    mintCredential: (
      audience: string,
      tierPolicy: unknown,
      opts: { model?: string; scopes?: string[]; ttlSeconds?: number; signal?: AbortSignal; captureErrors?: boolean } = {},
    ): Promise<DefaultBrokeredCredential> =>
      json<DefaultBrokeredCredential>(
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
    parseNdjsonStream: (response: Response, signal?: AbortSignal) => {
      const parsed = parseMatrxNdjsonResponse(response, signal);
      return { ...parsed, events: parsed.events as AsyncGenerator<TypedStreamEvent, void, undefined> };
    },

    // the server selection (no admin server switcher in a bare host)
    selectResolvedBaseUrl: (_state: unknown): string | undefined => baseUrl(),
    selectActiveServer: (_state: unknown): string => "production",
    selectActiveServerHealth: (_state: unknown): typeof UNKNOWN_SERVER_HEALTH => UNKNOWN_SERVER_HEALTH,
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
    invokeMatrxExtendTool: async (
      _toolName: string,
      _args: Record<string, unknown>,
    ): Promise<DefaultMatrxExtendInvocation> => {
      unhosted("The browser extension");
      // Same answer the app gives when no extension is reachable: the model is told, nothing throws.
      return { handled: false, reason: "matrx_extend_unavailable" };
    },
  };
}

export type DefaultChatServerApi = ReturnType<typeof createDefaultServerApi>;
