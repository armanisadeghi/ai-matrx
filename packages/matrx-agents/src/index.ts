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
export * from "./redux";
export * from "./types";

// ── Adapter types (consumers implement these to satisfy configure()) ──────
export type {
  AuthLike,
  CallbackManagerLike,
  Credentials,
  FetchLike,
  LoggerLike,
  SupabaseLike,
  SupabaseQueryBuilder,
  SupabaseRpcResult,
} from "./adapters";

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
} from "./config";

// ── Reducer-map helper for consumers that `combineReducers` ───────────────
export { buildAgentsReducerMap } from "./build-reducer-map";
