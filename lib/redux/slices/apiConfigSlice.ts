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
}

const initialState: ApiConfigState = {
  activeServer: "production",
  customUrl: null,
  health: buildDefaultHealth(),
  recentCalls: [],
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
    },

    setCustomUrl: (state, action: PayloadAction<string>) => {
      state.activeServer = "custom";
      state.customUrl = action.payload;
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
