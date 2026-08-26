# Persisted state synchronization

The sync engine is the single owner of browser-local persistence, cross-tab
replication, and remote reconciliation for registered Redux slices.

## Hydration boundary

**Persisted Redux boot is post-hydration only.**

Server-rendered HTML and the first client render must observe the same Redux
state. `StoreProvider` therefore creates the store without reading persisted
state, then `SyncBootstrap` starts the idempotent sync boot from a passive
effect. The passive boundary is load-bearing: it runs after descendant
hydration and layout work, so synchronous local-storage rehydration cannot
change a streamed or selectively hydrated subtree underneath React.

The store-owned `boot()` promise includes warm-cache IDB hydration. A
write-time resolver that depends on hydrated context joins that promise before
declaring the context missing; `ensureOrgId` is the canonical example.

**Never move sync boot** into store creation, render, `useLayoutEffect`, or an
inline script. Preferences that genuinely must apply before paint may mutate
DOM attributes/classes only through `SyncBootScript`; they must not dispatch
Redux state before hydration.

## Verification

`lib/sync/components/SyncBootstrap.test.tsx` renders the subject on the server,
hydrates it with `hydrateRoot`, and proves sync boot observes completion of a
descendant layout effect with no recoverable hydration errors.

## Change log

- 2026-08-26 — `boot()` now resolves after warm-cache IDB hydration, and
  `ensureOrgId` joins it before firing the loud personal-org fallback.
- 2026-08-20 — `remote.cacheSatisfies` now also guards the cache-warm after a
  `remote.fetch`: an insufficient fetch result is dispatched to Redux (the
  reducer decides what to accept) but never persisted over the cached record.
  Fixes the recurring lost-active-organization class: the appContext
  stale-refresh/cold-boot reconcile returns `organization_id: null` for a
  multi-org user with no default preference (the deliberate "nudge" answer),
  and that hollow record was overwriting the user's persisted selection, so
  every reload booted org-less (`fallback.cache.skipInsufficient` logs the
  skip).
- 2026-08-18 — Moved persisted Redux boot from the parent layout phase to the
  passive post-hydration phase, closing the remaining React #418 race for
  streamed/selectively hydrated routes.
- 2026-08-15 — Removed persisted-state hydration from store creation and made
  sync boot store-owned and idempotent.
