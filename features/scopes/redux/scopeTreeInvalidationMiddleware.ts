/**
 * features/scopes/redux/scopeTreeInvalidationMiddleware.ts
 *
 * Keeps the canonical scope tree live. The tree (orgs → scope types → scopes
 * → projects) is fetched ONCE at app boot (`ensureScopeTree`, no-refetch
 * policy) precisely so globally-placed consumers — sidebar pickers, every
 * ContextAssignment* component, resolvers — can read it without ever
 * re-fetching. The flip side of "never refetch" is "always invalidate on
 * write": this middleware watches the fulfilled action of every structural
 * mutation in the app and force-refreshes the tree once.
 *
 * Adding a new structural mutation anywhere? Add its `/fulfilled` type to
 * STRUCTURAL_MUTATIONS below — one line, and every surface stays fresh.
 *
 * Behavior:
 *   - Debounced 400ms — template application fires many creates back-to-back
 *     and must coalesce into a single tree refresh.
 *   - Fire-and-forget: a failed refresh logs loudly; the next mutation or
 *     manual `refresh()` retries.
 */

import type { Middleware, ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";

const STRUCTURAL_MUTATIONS = new Set<string>([
  // scope types (features/agent-context/redux/scope/scopeTypesSlice)
  "scopeTypes/create/fulfilled",
  "scopeTypes/update/fulfilled",
  "scopeTypes/delete/fulfilled",
  // scopes (features/agent-context/redux/scope/scopesSlice)
  "scopes/create/fulfilled",
  "scopes/update/fulfilled",
  "scopes/delete/fulfilled",
  // templates create whole sets of types + scopes (features/scope-system)
  "templates/apply/fulfilled",
  "templates/applyByKey/fulfilled",
]);

const DEBOUNCE_MS = 400;
let timer: ReturnType<typeof setTimeout> | null = null;

// Typed against a thunk-capable dispatch (the store always has thunks via
// RTK's defaults) so dispatching ensureScopeTree needs no coercion.
export const scopeTreeInvalidationMiddleware: Middleware<
  Record<string, never>,
  RootState,
  ThunkDispatch<RootState, unknown, UnknownAction>
> = (store) => (next) => (action) => {
  const result = next(action);
  const type = (action as { type?: string })?.type;
  if (type && STRUCTURAL_MUTATIONS.has(type)) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void Promise.resolve(
        store.dispatch(ensureScopeTree({ refresh: true })),
      ).catch((e: unknown) => {
        // Loud — a stale tree after a structural write is a real bug.
        console.error("[scopes] tree refresh after mutation failed", e);
      });
    }, DEBOUNCE_MS);
  }
  return result;
};
