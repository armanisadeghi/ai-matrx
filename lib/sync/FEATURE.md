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

**Never move sync boot** into store creation, render, `useLayoutEffect`, or an
inline script. Preferences that genuinely must apply before paint may mutate
DOM attributes/classes only through `SyncBootScript`; they must not dispatch
Redux state before hydration.

## Verification

`lib/sync/components/SyncBootstrap.test.tsx` renders the subject on the server,
hydrates it with `hydrateRoot`, and proves sync boot observes completion of a
descendant layout effect with no recoverable hydration errors.

## Change log

- 2026-08-18 — Moved persisted Redux boot from the parent layout phase to the
  passive post-hydration phase, closing the remaining React #418 race for
  streamed/selectively hydrated routes.
- 2026-08-15 — Removed persisted-state hydration from store creation and made
  sync boot store-owned and idempotent.
