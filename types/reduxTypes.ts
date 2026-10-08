// types/reduxTypes.ts
//
// BUILD-TIME OPTIMIZATION CONTRACT
// --------------------------------
// This file is imported by EVERY layout (core, admin, transitional, dev,
// public, Providers) plus AppShell and the redux store factory. Under
// `isolatedModules: true`, named imports without the `type` keyword force
// SWC to keep the module reference, which means Turbopack walks the target
// module for every chunk that touches this file.
//
// EVERY import here MUST be `import type` unless the symbol is actually
// used at runtime. `Database` is the entrypoint to the 24k-line
// `database.types.ts`; keeping it type-only deletes it from the slim
// path's static graph entirely.
import type { UserData } from "@/utils/userDataMapper";
import type { ContextMenuRow } from "@/utils/supabase/ssrShellData";
import type { UsageSnapshot } from "@/features/entitlements/usage-gate/usageState";

/**
 * Bootstrap state for the slim store (`makeStore`). Used by all routes that
 * do NOT depend on the legacy entity system (~95% of the app). Contains no
 * `globalCache` and no entity slices.
 */
export interface BaseReduxState {
  user: UserData;
  /**
   * THE ADMIN LANE seed: true only from the `(admin)` layout, so an admin
   * page's first render (server and client) already carries admin power and
   * every other page's does not. `AdminLaneSync` keeps it current afterwards.
   */
  adminLaneOpen?: boolean;
  /**
   * THE USAGE GATE seed: the person's `billing.user_usage_state` answer, read
   * by the layout in parallel with its own session/admin reads (USAGE-GATE.md
   * rule 9). Absent → the boot effect reads it off the request path.
   */
  usageSnapshot?: UsageSnapshot | null;
  // Preferences are no longer fetched server-side; the
  // `userPreferencesPolicy` warm-cache cold-boot path (IDB → LS → remote.fetch)
  // owns hydration entirely on the client. `resolveStoreBootstrapState` falls
  // back to `initializeUserPreferencesState(defaultUserPreferences)` when absent.
  userPreferences?: Record<string, any>;
  // Optional SSR pre-population.
  // contextMenuCache shape matches ContextMenuCacheState exactly — safe as preloaded state.
  // model records (core catalog) and sms need their own hydration (their shapes don't match raw arrays)
  // so they are handled by SsrShellHydrator client island, not preloaded state.
  contextMenuCache?: { rows: ContextMenuRow[]; hydrated: boolean };
  agentContextMenuCache?: { rows: ContextMenuRow[]; hydrated: boolean };
}
