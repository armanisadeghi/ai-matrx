// providers/StoreProvider.tsx
//
// Synchronous client-side store bootstrap. On the client the store is a
// module-level singleton so it survives React remounts (HMR, route-level
// re-renders, parent key changes) — `useRef` alone is per-instance and was
// re-running `bootSync` on every remount, leaking a fresh BroadcastChannel +
// channel listener each time.
//
// SSR path: `typeof window === "undefined"` — skip the module cache, create a
// per-render store via `useRef`. Each request stays isolated; `bootSync` is
// not invoked on the server.
//
// During the entity-isolation migration this provider became factory-agnostic:
// it accepts an optional `makeStore` prop so that the `(authenticated)` /
// `(core)` / `(dev)` route groups (slim) and `(legacy)` (entity-aware) can each
// pass their own factory. The module-level singleton is keyed by factory
// reference so navigating between groups produces the correct store. Default
// remains `makeStore` from `@/lib/redux/store` for back-compat.
//
// See `~/.claude/plans/the-entity-system-which-bubbly-wind.md`.

"use client";

import {
  makeStore as makeSlimStore,
  type AppStore as SlimAppStore,
} from "@/lib/redux/store";
import { useRef } from "react";
import { Provider } from "react-redux";
import { bootSync } from "@/lib/sync/engine/boot";
import { syncPolicies } from "@/lib/sync/registry";
import { attachStore } from "@/lib/sync/identity";
import { writeThemeCookie, type ThemeMode } from "@/styles/themes/themeSlice";
import { writeLastOrg } from "@/lib/redux/thunks/activeOrgBootstrap";

// Generic factory shape — both `makeStore` (slim) and `makeEntityStore`
// (entity) satisfy it. Their return types differ in `getState()` shape, but
// both expose the same `_sync` context + `subscribe`/`dispatch` surface that
// the bootstrap code below depends on.
type AnyStoreFactory = (initialState?: any) => SlimAppStore;

// Module-level browser singleton keyed by factory reference. Each route group
// passes a different factory and gets its own store. WeakMap would be ideal
// but factories are stable module-level consts so a regular Map is fine and
// gives us deterministic lookup.
const clientStores = new Map<AnyStoreFactory, SlimAppStore>();

function getOrCreateClientStore(
  factory: AnyStoreFactory,
  initialState?: any,
): SlimAppStore {
  const existing = clientStores.get(factory);
  if (existing) return existing;

  const store = factory(initialState);

  // Phase 4 PR 4.C: wire the reactive identity source. `attachStore` lets
  // non-React consumers (entity sagas, server-bridge utilities) read the
  // live Redux state via `getIdentityContext()` without holding their own
  // subscription. Replaces `lib/globalState.ts` (deleted) and
  // `app/Providers.tsx::setGlobalUserId` (deleted).
  attachStore(store);

  void bootSync({
    store,
    identity: store._sync.identity,
    policies: syncPolicies,
    openChannel: () => store._sync.channel,
    // Live getter so Phase 2 stale-refresh + remote-fetch see the current
    // identity after a runtime swap (store._sync.setIdentity).
    getIdentity: () => store._sync.getIdentity(),
  });

  // Keep the `theme` cookie in lockstep with Redux so the server-side
  // pre-paint always reflects the user's last choice.
  let lastMode: ThemeMode | undefined = store.getState().theme?.mode;
  // Persist the active org to localStorage so the user's last-used org is
  // restored on the next boot (active-org bootstrap reads it). Captures every
  // writer — sidebar context selector, header switcher, scopes UI — from one
  // place, the same way the theme cookie stays in lockstep above.
  let lastOrgId: string | null | undefined =
    store.getState().appContext?.organization_id;
  store.subscribe(() => {
    const state = store.getState();

    const mode = state.theme?.mode;
    if (mode && mode !== lastMode) {
      lastMode = mode;
      writeThemeCookie(mode);
    }

    const orgId = state.appContext?.organization_id ?? null;
    if (orgId !== lastOrgId) {
      lastOrgId = orgId;
      writeLastOrg(
        orgId
          ? { id: orgId, name: state.appContext?.organization_name ?? null }
          : null,
      );
    }
  });

  clientStores.set(factory, store);
  return store;
}

export default function StoreProvider({
  children,
  initialState,
  makeStore = makeSlimStore as AnyStoreFactory,
}: {
  children: React.ReactNode;
  initialState?: any;
  makeStore?: AnyStoreFactory;
}) {
  const storeRef = useRef<SlimAppStore | null>(null);

  if (!storeRef.current) {
    if (typeof window !== "undefined") {
      // Browser: reuse the per-tab singleton keyed by factory. Idempotent
      // across remounts.
      storeRef.current = getOrCreateClientStore(makeStore, initialState);
    } else {
      // SSR: per-request store. No boot (server has no localStorage anyway).
      storeRef.current = makeStore(initialState);
    }
  }

  if (!storeRef.current) {
    throw new Error("Redux store failed to initialize");
  }

  return <Provider store={storeRef.current}>{children}</Provider>;
}
