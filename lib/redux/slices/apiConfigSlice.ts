// lib/redux/slices/apiConfigSlice.ts
//
// Single source of truth for the active backend server, per-environment health,
// and API call log. Applies to ALL users — not admin-only.
//
// Every code path that makes a backend call reads selectResolvedBaseUrl from
// this slice. Changing the active server here guarantees every call in the
// entire app immediately routes to the new server.
//
// ─── Public API ───────────────────────────────────────────────────────────────
//
// Actions (for direct dispatch):
//   setActiveServer(env)          — low-level; prefer switchServer thunk
//   setCustomUrl(url)             — low-level; prefer switchServer thunk
//
// Thunks (prefer these):
//   switchServer(env, customUrl?) — sets server + triggers health check
//   checkServerHealth(env?)       — hits {serverUrl}/health, stores result; skips if
//                                   checked within the last 5 minutes
//
// Selectors:
//   selectActiveServer            — current ServerEnvironment key
//   selectResolvedBaseUrl         — actual URL string ready to prepend to paths
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
   * (e.g. "/ai/v2/chat"). Wins over `apiVersion`. This is the surgical
   * "send THIS call somewhere else for a test" escape hatch — change both the
   * version and the core route without editing code.
   */
  pathOverrides: Record<string, string>;
}

// ── Persistence ─────────────────────────────────────────────────────────────
// The active server is an admin/dev choice that must SURVIVE reloads — losing
// "localhost" on every refresh and silently snapping back to production is a
// real footgun. SSR-safe: no-op on the server, lazy-read on the client.
const PERSIST_KEY = "matrx.apiConfig.v1";

interface PersistedApiConfig {
  activeServer: ServerEnvironment;
  customUrl: string | null;
  apiVersion: string | null;
  pathOverrides: Record<string, string>;
}

function loadPersistedServer(): PersistedApiConfig {
  const fallback: PersistedApiConfig = {
    activeServer: "production",
    customUrl: null,
    apiVersion: null,
    pathOverrides: {},
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
      apiVersion:
        typeof parsed.apiVersion === "string" && parsed.apiVersion.trim()
          ? parsed.apiVersion
          : null,
      pathOverrides:
        parsed.pathOverrides && typeof parsed.pathOverrides === "object"
          ? parsed.pathOverrides
          : {},
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
      apiVersion: state.apiVersion,
      pathOverrides: state.pathOverrides,
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
  health: buildDefaultHealth(),
  recentCalls: [],
  apiVersion: _persisted.apiVersion,
  pathOverrides: _persisted.pathOverrides,
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
     * (e.g. "/ai/manual" → "/ai/v2/chat"). Pass an empty/whitespace
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
  setApiVersion,
  setPathOverride,
  clearPathOverride,
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

/** The global API version segment (null = no version transform applied). */
export const selectApiVersion = (state: StateWithApiConfig): string | null =>
  state.apiConfig.apiVersion;

/** Exact-match endpoint path overrides (canonical path → replacement path). */
export const selectPathOverrides = (
  state: StateWithApiConfig,
): Record<string, string> => state.apiConfig.pathOverrides;

/**
 * The combined endpoint-override config — ready to hand straight to
 * `resolveEndpointPath(path, config)`. Memoized so it is referentially stable
 * between override changes.
 */
export const selectEndpointOverrideConfig = createSelector(
  selectApiVersion,
  selectPathOverrides,
  (apiVersion, pathOverrides) => ({ apiVersion, pathOverrides }),
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
): string | undefined => {
  const env = state.apiConfig.activeServer;
  if (env === "custom") {
    return state.apiConfig.customUrl ?? undefined;
  }
  return BACKEND_URLS[env];
};

/** Health record for a specific environment */
export const selectServerHealth = (
  state: StateWithApiConfig,
  env: ServerEnvironment,
): ServerHealthRecord => state.apiConfig.health[env];

/** Health record for the currently active server */
export const selectActiveServerHealth = (
  state: StateWithApiConfig,
): ServerHealthRecord => state.apiConfig.health[state.apiConfig.activeServer];

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
): boolean =>
  state.apiConfig.health[state.apiConfig.activeServer].status === "healthy";
