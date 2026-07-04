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

/**
 * Bootstrap state for the slim store (`makeStore`). Used by all routes that
 * do NOT depend on the legacy entity system (~95% of the app). Contains no
 * `globalCache` and no entity slices.
 */
export interface BaseReduxState {
  user: UserData;
  // Preferences are no longer fetched server-side; the
  // `userPreferencesPolicy` warm-cache cold-boot path (IDB → LS → remote.fetch)
  // owns hydration entirely on the client. `resolveStoreBootstrapState` falls
  // back to `initializeUserPreferencesState(defaultUserPreferences)` when absent.
  userPreferences?: Record<string, any>;
  // Optional SSR pre-population.
  // contextMenuCache shape matches ContextMenuCacheState exactly — safe as preloaded state.
  // modelRegistry and sms need action-based hydration (their shapes don't match raw arrays)
  // so they are handled by SsrShellHydrator client island, not preloaded state.
  contextMenuCache?: { rows: ContextMenuRow[]; hydrated: boolean };
  agentContextMenuCache?: { rows: ContextMenuRow[]; hydrated: boolean };
}
