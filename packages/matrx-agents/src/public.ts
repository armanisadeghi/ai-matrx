/**
 * @matrx/agents — public entry point.
 *
 * This is a scaffold re-exporting the in-repo implementation; physical
 * file extraction happens in Phase 9.4. Consumers already using
 * `@matrx/agents/*` paths keep working across that migration because the
 * public surface (types + actions + selectors + thunks) does not change.
 *
 * Boot sequence:
 *   1. `configure(...)` with host adapters
 *   2. Plug the reducers from `./redux` into your root reducer
 *   3. Dispatch thunks / subscribe via selectors as normal
 */

// ── Core public surface ────────────────────────────────────────────────────
export * from "./redux/slices";
export * from "./redux/thunks";
export * from "./redux/selectors";
export * from "./redux/hooks";
export * from "./types/agents-types";

// ── Adapter types (consumers implement these to satisfy configure()) ──────
export type { AuthLike, Credentials } from "./adapters/auth";
export type { CallbackManagerLike } from "./adapters/callback-manager";
export type { FetchLike } from "./adapters/fetch";
export type { LoggerLike } from "./adapters/logger";
export type {
  SupabaseLike,
  SupabaseQueryBuilder,
  SupabaseRpcResult,
} from "./adapters/supabase";

// ── configure() entry + runtime accessors (for advanced host wiring) ──────
export {
  configure,
  isConfigured,
  getSupabase,
  getFetch,
  getApiBaseUrl,
  getCallbackManager,
  getAuth,
  getLogger,
  __resetAgentsConfigForTesting,
  type AgentsConfig,
} from "./config/registry";

// ── Reducer-map helper for consumers that `combineReducers` ───────────────
export { buildAgentsReducerMap } from "./build-reducer-map";
