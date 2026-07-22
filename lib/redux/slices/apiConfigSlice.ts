// lib/redux/slices/apiConfigSlice.ts
//
// Single source of truth for the active API environment, per-service overrides,
// aidream health, and API call log. Applies to ALL users — not admin-only.
//
// aidream calls read selectResolvedBaseUrl; independently deployed services
// read selectResolvedServiceBaseUrl. The main environment switch updates all
// four unless an admin deliberately pins an individual service.
//
// ─── Public API ───────────────────────────────────────────────────────────────
//
// Actions (for direct dispatch):
//   setActiveServer(env)          — low-level; prefer switchServer thunk
//   setCustomUrl(url)             — low-level; prefer switchServer thunk
//   setServiceOverride(...)       — pin one service to production/localhost
//   clearServiceOverrides()       — make every service follow the global switch
//
// Thunks (prefer these):
//   switchServer(env, customUrl?) — sets server + triggers health check
//   checkServerHealth(env?)       — hits {serverUrl}/health, stores result; skips if
//                                   checked within the last 5 minutes
//
// Selectors:
//   selectActiveServer            — current ServerEnvironment key
//   selectResolvedBaseUrl         — actual URL string ready to prepend to paths
//   selectResolvedServiceBaseUrl  — URL for aidream/scraper/files/seo
//   selectCustomUrl               — the custom URL (when env === 'custom')
//   selectServerHealth(env)       — health record for one environment
//   selectActiveServerHealth      — health for the currently active environment
//   selectAllServerHealth         — array of all envs + health (for UI lists)
//   selectRecentApiCalls          — ring buffer of recent calls (max 50)

import {
  createSlice,
  createAsyncThunk,
  createSelector,
  PayloadAction,
} from "@reduxjs/toolkit";
import { BACKEND_URLS, ENDPOINTS } from "@/lib/api/endpoints";
import { logApiTarget } from "@/lib/api/log-api-target";
import {
  AI_API_VERSION_DEFAULT,
  aiVersionPathOverrides,
  type AiApiVersion,
} from "@/lib/api/ai-api-version";
import {
  API_SERVICES,
  configuredServiceUrl,
  type ApiService,
  type ServiceEnvironment,
} from "@/lib/api/service-routing";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Named server environments.
 *
 * Maps 1:1 to the keys in BACKEND_URLS (lib/api/endpoints.ts).
 * 'custom' resolves to the admin-entered customUrl field.
 */
export type ServerEnvironment =
  | "production"
  | "development"
  | "ec2"
  | "staging"
  | "localhost"
  | "gpu"
  | "custom";

export interface ServerHealthRecord {
  status: "healthy" | "unhealthy" | "checking" | "unknown";
  lastCheckedAt: number | null; // epoch ms
  latencyMs: number | null;
  httpStatus: number | null;
  error: string | null;
}

export interface ApiCallLogEntry {
  id: string;
  path: string;
  method: string;
  baseUrl: string;
  status: "pending" | "success" | "error";
  httpStatus?: number;
  durationMs?: number;
  requestId?: string;
  timestamp: number;
}

const ALL_ENVIRONMENTS: ServerEnvironment[] = [
  "production",
  "development",
  "staging",
  "localhost",
  "gpu",
  "custom",
];

const HEALTH_STALENESS_MS = 5 * 60 * 1000; // 5 minutes
const HEALTH_CHECK_TIMEOUT_MS = 5000;
const MAX_RECENT_CALLS = 50;

function buildDefaultHealth(): Record<ServerEnvironment, ServerHealthRecord> {
  return ALL_ENVIRONMENTS.reduce(
    (acc, env) => {
      acc[env] = {
        status: "unknown",
        lastCheckedAt: null,
        latencyMs: null,
        httpStatus: null,
        error: null,
      };
      return acc;
    },
    {} as Record<ServerEnvironment, ServerHealthRecord>,
  );
}

interface ApiConfigState {
  activeServer: ServerEnvironment;
  customUrl: string | null;
  /** Per-service production/localhost exceptions; absent means follow activeServer. */
  serviceOverrides: Partial<Record<ApiService, ServiceEnvironment>>;
  health: Record<ServerEnvironment, ServerHealthRecord>;
  recentCalls: ApiCallLogEntry[];

  /**
   * Global API version override. When set (e.g. "v2"), every backend PATH is
   * prefixed with this leading segment (the base URL / server selection is
   * untouched). `null` → no version transform. See
   * lib/api/resolve-endpoint-path.ts.
   */
  apiVersion: string | null;

  /**
   * Exact-match endpoint path overrides — canonical path (the ENDPOINTS /
   * schema template, e.g. "/ai/manual") → full replacement path
   * (e.g. "/v2/ai/manual"). Wins over `apiVersion`. This is the surgical
   * "send THIS call somewhere else for a test" escape hatch — change both the
   * version and the core route without editing code.
   */
  pathOverrides: Record<string, string>;

  /**
   * Admin override for the AI runtime API version (the v1/v2 spine). `null`
   * means "follow the code-level default" (`AI_API_VERSION_DEFAULT`); a set
   * value pins this browser to that version and persists across reloads —
   * exactly like the localhost/production server choice. Scoped to the four
   * covered AI surfaces only (see lib/api/ai-api-version.ts); never a blanket
   * path prefix. Read the EFFECTIVE version via `selectAiApiVersion`.
   */
  aiApiVersionOverride: AiApiVersion | null;
}

// ── Persistence ─────────────────────────────────────────────────────────────
// The active server is an admin/dev choice that must SURVIVE reloads — losing
// "localhost" on every refresh and silently snapping back to production is a
// real footgun. SSR-safe: no-op on the server, lazy-read on the client.
const PERSIST_KEY = "matrx.apiConfig.v1";

interface PersistedApiConfig {
  activeServer: ServerEnvironment;
  customUrl: string | null;
  serviceOverrides: Partial<Record<ApiService, ServiceEnvironment>>;
  apiVersion: string | null;
  pathOverrides: Record<string, string>;
  aiApiVersionOverride: AiApiVersion | null;
}

function loadPersistedServer(): PersistedApiConfig {
  const fallback: PersistedApiConfig = {
    activeServer: "production",
    customUrl: null,
    serviceOverrides: {},
    apiVersion: null,
    pathOverrides: {},
    aiApiVersionOverride: null,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedApiConfig>;
    const valid: ServerEnvironment[] = [
      "production",
      "development",
      "ec2",
      "staging",
      "localhost",
      "gpu",
      "custom",
    ];
    return {
      activeServer:
        parsed.activeServer && valid.includes(parsed.activeServer)
          ? parsed.activeServer
          : "production",
      customUrl: typeof parsed.customUrl === "string" ? parsed.customUrl : null,
      serviceOverrides: Object.fromEntries(
        API_SERVICES.flatMap((service) => {
          const value = parsed.serviceOverrides?.[service];
          return value === "production" || value === "localhost"
            ? [[service, value]]
            : [];
        }),
      ),
      apiVersion:
        typeof parsed.apiVersion === "string" && parsed.apiVersion.trim()
          ? parsed.apiVersion
          : null,
      pathOverrides:
        parsed.pathOverrides && typeof parsed.pathOverrides === "object"
          ? parsed.pathOverrides
          : {},
      aiApiVersionOverride:
        parsed.aiApiVersionOverride === "v1" ||
        parsed.aiApiVersionOverride === "v2"
          ? parsed.aiApiVersionOverride
          : null,
    };
  } catch {
    return fallback;
  }
}

function persistServer(state: ApiConfigState): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedApiConfig = {
      activeServer: state.activeServer,
      customUrl: state.customUrl,
      serviceOverrides: state.serviceOverrides,
      apiVersion: state.apiVersion,
      pathOverrides: state.pathOverrides,
      aiApiVersionOverride: state.aiApiVersionOverride,
    };
    window.localStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
  } catch {
    /* quota / privacy mode — non-fatal */
  }
}

const _persisted = loadPersistedServer();

const initialState: ApiConfigState = {
  activeServer: _persisted.activeServer,
  customUrl: _persisted.customUrl,
  serviceOverrides: _persisted.serviceOverrides,
  health: buildDefaultHealth(),
  recentCalls: [],
  apiVersion: _persisted.apiVersion,
  pathOverrides: _persisted.pathOverrides,
  aiApiVersionOverride: _persisted.aiApiVersionOverride,
};

// ============================================================================
// THUNKS
// ============================================================================

/**
 * Switch the active server and immediately check its health.
 *
 * For 'custom', pass the full origin URL as the second argument.
 * This is the preferred action for all server-switching UI (admin indicator,
 * chat header toggles, etc.).
 */
export const switchServer = createAsyncThunk(
  "apiConfig/switchServer",
  async (
    { env, customUrl }: { env: ServerEnvironment; customUrl?: string },
    { dispatch },
  ) => {
    dispatch(setActiveServer(env));
    if (env === "custom" && customUrl) {
      dispatch(setCustomUrl(customUrl));
    }
    dispatch(checkServerHealth({ env, force: true }));
    return env;
  },
);

/**
 * Hit /health on the target environment and store the result.
 *
 * - If env is omitted, checks the currently active server.
 * - Skips if the last check was less than 5 minutes ago, unless force = true.
 * - Uses a raw fetch (not callApi) — this is infrastructure, not a user call.
 */
export const checkServerHealth = createAsyncThunk(
  "apiConfig/checkServerHealth",
  async (
    { env, force = false }: { env?: ServerEnvironment; force?: boolean },
    { dispatch, getState },
  ) => {
    const state = getState() as { apiConfig: ApiConfigState };
    const targetEnv = env ?? state.apiConfig.activeServer;
    const healthRecord = state.apiConfig.health[targetEnv];

    // Staleness guard — skip if fresh and not forced
    if (!force && healthRecord.lastCheckedAt) {
      const age = Date.now() - healthRecord.lastCheckedAt;
      if (age < HEALTH_STALENESS_MS) {
        return { env: targetEnv, skipped: true };
      }
    }

    const baseUrl =
      targetEnv === "custom"
        ? state.apiConfig.customUrl
        : BACKEND_URLS[targetEnv];

    if (!baseUrl) {
      dispatch(
        setServerHealthResult({
          env: targetEnv,
          status: "unhealthy",
          latencyMs: null,
          httpStatus: null,
          error: `No URL configured for "${targetEnv}". Set the corresponding NEXT_PUBLIC_BACKEND_URL_* env variable.`,
        }),
      );
      return { env: targetEnv, skipped: false };
    }

    dispatch(setServerHealthChecking(targetEnv));

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      HEALTH_CHECK_TIMEOUT_MS,
    );
    const startMs = performance.now();

    const healthUrl = `${baseUrl}${ENDPOINTS.health.check}`;
    logApiTarget(healthUrl, {
      source: "checkServerHealth",
      method: "GET",
      channel: "health-check",
      activeServer: state.apiConfig.activeServer,
      targetEnv,
    });

    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - startMs);

      if (response.ok) {
        dispatch(
          setServerHealthResult({
            env: targetEnv,
            status: "healthy",
            latencyMs,
            httpStatus: response.status,
            error: null,
          }),
        );
      } else {
        dispatch(
          setServerHealthResult({
            env: targetEnv,
            status: "unhealthy",
            latencyMs,
            httpStatus: response.status,
            error: `HTTP ${response.status}`,
          }),
        );
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - startMs);
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      dispatch(
        setServerHealthResult({
          env: targetEnv,
          status: "unhealthy",
          latencyMs,
          httpStatus: null,
          error: isAbort
            ? "Health check timed out"
            : err instanceof Error
              ? err.message
              : "Unknown error",
        }),
      );
    }

    return { env: targetEnv, skipped: false };
  },
);

// ============================================================================
// SLICE
// ============================================================================

const apiConfigSlice = createSlice({
  name: "apiConfig",
  initialState,
  reducers: {
    setActiveServer: (state, action: PayloadAction<ServerEnvironment>) => {
      state.activeServer = action.payload;
      // Clear custom URL when switching away from custom
      if (action.payload !== "custom") {
        state.customUrl = null;
      }
      persistServer(state);
    },

    setCustomUrl: (state, action: PayloadAction<string>) => {
      state.activeServer = "custom";
      state.customUrl = action.payload;
      persistServer(state);
    },

    /** Pin one service independently; null removes the pin and follows global. */
    setServiceOverride: (
      state,
      action: PayloadAction<{
        service: ApiService;
        environment: ServiceEnvironment | null;
      }>,
    ) => {
      const { service, environment } = action.payload;
      if (environment === null) {
        delete state.serviceOverrides[service];
      } else {
        state.serviceOverrides[service] = environment;
      }
      persistServer(state);
    },

    /** A global environment click means every service follows it again. */
    clearServiceOverrides: (state) => {
      state.serviceOverrides = {};
      persistServer(state);
    },

    /**
     * Set (or clear, with null/"") the global API version segment applied to
     * every backend path. Persisted across reloads. Does NOT touch the base
     * URL — localhost/prod/custom routing is unaffected.
     */
    setApiVersion: (state, action: PayloadAction<string | null>) => {
      const v = action.payload?.trim();
      state.apiVersion = v ? v : null;
      persistServer(state);
    },

    /**
     * Override a single canonical endpoint path with a full replacement path
     * (e.g. "/ai/manual" → "/v2/ai/manual"). Pass an empty/whitespace
     * replacement to remove the override. Persisted across reloads.
     */
    setPathOverride: (
      state,
      action: PayloadAction<{ canonicalPath: string; replacement: string }>,
    ) => {
      const { canonicalPath, replacement } = action.payload;
      const next = replacement?.trim();
      if (next) {
        state.pathOverrides[canonicalPath] = next;
      } else {
        delete state.pathOverrides[canonicalPath];
      }
      persistServer(state);
    },

    /** Remove a single endpoint path override. */
    clearPathOverride: (state, action: PayloadAction<string>) => {
      delete state.pathOverrides[action.payload];
      persistServer(state);
    },

    /**
     * Set the AI runtime API version override (v1/v2 spine). Pass `null` to
     * clear the override and follow the code-level default
     * (`AI_API_VERSION_DEFAULT`). Persisted across reloads. Applies ONLY to the
     * four covered AI surfaces — never a blanket path prefix. See
     * lib/api/ai-api-version.ts.
     */
    setAiApiVersion: (
      state,
      action: PayloadAction<AiApiVersion | null>,
    ) => {
      state.aiApiVersionOverride = action.payload;
      persistServer(state);
    },

    /** Clear every API override (version + all path overrides) at once. */
    clearApiOverrides: (state) => {
      state.apiVersion = null;
      state.pathOverrides = {};
      persistServer(state);
    },

    setServerHealthChecking: (
      state,
      action: PayloadAction<ServerEnvironment>,
    ) => {
      state.health[action.payload].status = "checking";
    },

    setServerHealthResult: (
      state,
      action: PayloadAction<{
        env: ServerEnvironment;
        status: "healthy" | "unhealthy";
        latencyMs: number | null;
        httpStatus: number | null;
        error: string | null;
      }>,
    ) => {
      const { env, status, latencyMs, httpStatus, error } = action.payload;
      state.health[env] = {
        status,
        lastCheckedAt: Date.now(),
        latencyMs,
        httpStatus,
        error,
      };
    },

    appendApiCallLog: (state, action: PayloadAction<ApiCallLogEntry>) => {
      // Upsert — if entry with same id exists, update it; otherwise prepend
      const idx = state.recentCalls.findIndex(
        (c) => c.id === action.payload.id,
      );
      if (idx !== -1) {
        state.recentCalls[idx] = action.payload;
      } else {
        state.recentCalls.unshift(action.payload);
        if (state.recentCalls.length > MAX_RECENT_CALLS) {
          state.recentCalls.length = MAX_RECENT_CALLS;
        }
      }
    },

    clearApiCallLog: (state) => {
      state.recentCalls = [];
    },
  },
});

export const {
  setActiveServer,
  setCustomUrl,
  setServiceOverride,
  clearServiceOverrides,
  setApiVersion,
  setPathOverride,
  clearPathOverride,
  setAiApiVersion,
  clearApiOverrides,
  setServerHealthChecking,
  setServerHealthResult,
  appendApiCallLog,
  clearApiCallLog,
} = apiConfigSlice.actions;

export default apiConfigSlice.reducer;

// ============================================================================
// SELECTORS
// ============================================================================

type StateWithApiConfig = { apiConfig: ApiConfigState };

/** The current active ServerEnvironment key */
export const selectActiveServer = (
  state: StateWithApiConfig,
): ServerEnvironment => state.apiConfig.activeServer;

/** The custom URL (only meaningful when activeServer === 'custom') */
export const selectCustomUrl = (state: StateWithApiConfig): string | null =>
  state.apiConfig.customUrl;

export const selectServiceOverrides = (
  state: StateWithApiConfig,
): Partial<Record<ApiService, ServiceEnvironment>> =>
  state.apiConfig.serviceOverrides;

export function selectGlobalServiceEnvironment(
  state: StateWithApiConfig,
): ServiceEnvironment {
  return state.apiConfig.activeServer === "localhost"
    ? "localhost"
    : "production";
}

export function selectResolvedServiceEnvironment(
  state: StateWithApiConfig,
  service: ApiService,
): ServiceEnvironment {
  return (
    state.apiConfig.serviceOverrides[service] ??
    selectGlobalServiceEnvironment(state)
  );
}

export function selectResolvedServiceBaseUrl(
  state: StateWithApiConfig,
  service: ApiService,
): string | undefined {
  if (
    service === "aidream" &&
    !state.apiConfig.serviceOverrides.aidream &&
    state.apiConfig.activeServer !== "production" &&
    state.apiConfig.activeServer !== "localhost"
  ) {
    return state.apiConfig.activeServer === "custom"
      ? state.apiConfig.customUrl ?? undefined
      : BACKEND_URLS[state.apiConfig.activeServer];
  }
  return configuredServiceUrl(
    service,
    selectResolvedServiceEnvironment(state, service),
  );
}

export const selectApiServiceTargets = createSelector(
  (state: StateWithApiConfig) => state.apiConfig,
  (apiConfig) => {
    const globalEnvironment: ServiceEnvironment =
      apiConfig.activeServer === "localhost" ? "localhost" : "production";
    return API_SERVICES.map((service) => {
      const override = apiConfig.serviceOverrides[service] ?? null;
      const environment = override ?? globalEnvironment;
      const url =
        service === "aidream" &&
        override === null &&
        apiConfig.activeServer !== "production" &&
        apiConfig.activeServer !== "localhost"
          ? apiConfig.activeServer === "custom"
            ? apiConfig.customUrl ?? undefined
            : BACKEND_URLS[apiConfig.activeServer]
          : configuredServiceUrl(service, environment);
      return { service, environment, override, url };
    });
  },
);

/** The global API version segment (null = no version transform applied). */
export const selectApiVersion = (state: StateWithApiConfig): string | null =>
  state.apiConfig.apiVersion;

/** Exact-match endpoint path overrides (canonical path → replacement path). */
export const selectPathOverrides = (
  state: StateWithApiConfig,
): Record<string, string> => state.apiConfig.pathOverrides;

/**
 * The raw AI-version admin override (`null` = following the code default). Use
 * this to tell whether the toggle has been explicitly flipped; use
 * `selectAiApiVersion` for the version actually in effect.
 */
export const selectAiApiVersionOverride = (
  state: StateWithApiConfig,
): AiApiVersion | null => state.apiConfig.aiApiVersionOverride;

/**
 * The EFFECTIVE AI runtime API version: the admin override when set, otherwise
 * the code-level default (`AI_API_VERSION_DEFAULT`). This is what every AI call
 * site reads to decide v1 vs v2.
 */
export const selectAiApiVersion = (
  state: StateWithApiConfig,
): AiApiVersion =>
  state.apiConfig.aiApiVersionOverride ?? AI_API_VERSION_DEFAULT;

/**
 * The combined endpoint-override config — ready to hand straight to
 * `resolveEndpointPath(path, config)`. Memoized so it is referentially stable
 * between override changes.
 *
 * The AI version (v1/v2 spine) is folded in as the BASE layer of path
 * overrides — scoped to only the four covered AI surfaces — so every call
 * through the registry picks up v2 automatically. Explicit admin `pathOverrides`
 * are spread last and therefore win over the version default (the surgical
 * "send THIS call elsewhere" escape hatch still overrides).
 */
export const selectEndpointOverrideConfig = createSelector(
  selectApiVersion,
  selectPathOverrides,
  selectAiApiVersion,
  (apiVersion, pathOverrides, aiApiVersion) => ({
    apiVersion,
    pathOverrides: {
      ...aiVersionPathOverrides(aiApiVersion),
      ...pathOverrides,
    },
  }),
);

/** Whether any API override (version or path) is currently active. */
export const selectHasActiveApiOverrides = (
  state: StateWithApiConfig,
): boolean =>
  state.apiConfig.apiVersion !== null ||
  Object.keys(state.apiConfig.pathOverrides).length > 0;

/**
 * The resolved base URL string for the active server.
 *
 * This is the single value every API call path reads to know where to send
 * requests. Components display this. callApi reads this. Hooks read this.
 *
 * Returns undefined if the env var is not set — callers should handle gracefully.
 */
export const selectResolvedBaseUrl = (
  state: StateWithApiConfig,
): string | undefined => selectResolvedServiceBaseUrl(state, "aidream");

/** Health record for a specific environment */
export const selectServerHealth = (
  state: StateWithApiConfig,
  env: ServerEnvironment,
): ServerHealthRecord => state.apiConfig.health[env];

/** Health record for the currently active server */
export const selectActiveServerHealth = (
  state: StateWithApiConfig,
): ServerHealthRecord => {
  const override = state.apiConfig.serviceOverrides.aidream;
  return state.apiConfig.health[override ?? state.apiConfig.activeServer];
};

/** All environments with their resolved URL and health record, for UI lists */
export const selectAllServerHealth = createSelector(
  (state: StateWithApiConfig) => state.apiConfig.health,
  (state: StateWithApiConfig) => state.apiConfig.activeServer,
  (state: StateWithApiConfig) => state.apiConfig.customUrl,
  (health, activeServer, customUrl) =>
    ALL_ENVIRONMENTS.map((env) => ({
      env,
      resolvedUrl: env === "custom" ? customUrl : BACKEND_URLS[env],
      isConfigured: env === "custom" ? !!customUrl : !!BACKEND_URLS[env],
      health: health[env],
      isActive: activeServer === env,
    })),
);

/** Recent API call log entries (newest first) */
export const selectRecentApiCalls = (
  state: StateWithApiConfig,
): ApiCallLogEntry[] => state.apiConfig.recentCalls;

/** Convenience: whether the active server is known healthy */
export const selectIsActiveServerHealthy = (
  state: StateWithApiConfig,
): boolean => selectActiveServerHealth(state).status === "healthy";
