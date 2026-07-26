/**
 * Runtime adapter registry — module-level singleton that `configure()`
 * populates and the package's thunks / selectors read at dispatch time.
 *
 * Using a module-level singleton (rather than threading every adapter
 * through every thunk arg) keeps the public thunk signatures clean and
 * matches the host app's expectation: consumers dispatch `launchConversation`
 * the same way they always have, no extra config arg.
 *
 * The tradeoff: `configure()` MUST run before any dispatch. The getters
 * below throw a clear error if called before config — surfacing the
 * mis-wire at the call site instead of a confusing Supabase "undefined.rpc"
 * deeper in the stack.
 */

import type { AuthLike, Credentials } from "../adapters/auth";
import type { CallbackManagerLike } from "../adapters/callback-manager";
import type { FetchLike } from "../adapters/fetch";
import type { LoggerLike } from "../adapters/logger";
import type { SupabaseLike } from "../adapters/supabase";

// =============================================================================
// Registry state
// =============================================================================

interface RegistryState {
  supabase: SupabaseLike | null;
  fetch: FetchLike | null;
  apiBaseUrl: string | null;
  callbackManager: CallbackManagerLike | null;
  auth: AuthLike | null;
  logger: LoggerLike;
}

const defaultLogger: LoggerLike = {
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  debug: (...args) => console.debug(...args),
};

const registry: RegistryState = {
  supabase: null,
  fetch: null,
  apiBaseUrl: null,
  callbackManager: null,
  auth: null,
  logger: defaultLogger,
};

// =============================================================================
// Public API
// =============================================================================

export interface AgentsConfig {
  supabase: SupabaseLike;
  fetch: FetchLike;
  apiBaseUrl: string;
  callbackManager: CallbackManagerLike;
  auth: AuthLike;
  logger?: LoggerLike;
}

/**
 * Install the host's adapter implementations. Call ONCE, before the first
 * slice action or thunk is dispatched. Subsequent calls replace the
 * previous registration — useful for test harnesses swapping the stack.
 */
export function configure(config: AgentsConfig): void {
  registry.supabase = config.supabase;
  registry.fetch = config.fetch;
  registry.apiBaseUrl = config.apiBaseUrl;
  registry.callbackManager = config.callbackManager;
  registry.auth = config.auth;
  registry.logger = config.logger ?? defaultLogger;
}

/** Returns true when `configure()` has run with all required adapters. */
export function isConfigured(): boolean {
  return (
    registry.supabase !== null &&
    registry.fetch !== null &&
    registry.apiBaseUrl !== null &&
    registry.callbackManager !== null &&
    registry.auth !== null
  );
}

// =============================================================================
// Accessors — used by thunks / selectors. Throw on missing config.
// =============================================================================

function requireAdapter<K extends keyof RegistryState>(
  key: K,
  name: string,
): NonNullable<RegistryState[K]> {
  const value = registry[key];
  if (value === null) {
    throw new Error(
      `[@matrx/agents] ${name} adapter not configured. Call \`configure({ ${name}: ... })\` before dispatching any agents action or thunk.`,
    );
  }
  return value as NonNullable<RegistryState[K]>;
}

export const getSupabase = (): SupabaseLike =>
  requireAdapter("supabase", "supabase");
export const getFetch = (): FetchLike => requireAdapter("fetch", "fetch");
export const getApiBaseUrl = (): string =>
  requireAdapter("apiBaseUrl", "apiBaseUrl");
export const getCallbackManager = (): CallbackManagerLike =>
  requireAdapter("callbackManager", "callbackManager");
export const getAuth = (): AuthLike => requireAdapter("auth", "auth");
export const getLogger = (): LoggerLike => registry.logger;

/**
 * Test-only: wipe the registry. Do not call from application code.
 * Exported so test runners can reset between suites.
 */
export function __resetAgentsConfigForTesting(): void {
  registry.supabase = null;
  registry.fetch = null;
  registry.apiBaseUrl = null;
  registry.callbackManager = null;
  registry.auth = null;
  registry.logger = defaultLogger;
}
