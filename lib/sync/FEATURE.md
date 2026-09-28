# Persisted state synchronization

The sync engine is the single owner of browser-local persistence, cross-tab
replication, and remote reconciliation for registered Redux slices.

## Hydration boundary

**Persisted Redux boot is post-hydration only.**

Server-rendered HTML and the first client render must observe the same Redux
state. `StoreProvider` therefore creates the store without reading persisted
state, then `SyncBootstrap` schedules the idempotent sync boot after window
load at a browser-idle turn with no pending React streaming boundary. Idle
alone is **not** a hydration boundary: a streamed descendant may still hydrate.

The store-owned `boot()` promise includes warm-cache IDB hydration. A
write-time resolver that depends on hydrated context joins that promise before
declaring the context missing; `ensureOrgId` is the canonical example.

**Never move sync boot** into store creation, render, `useLayoutEffect`, an
un-gated passive effect, or an inline script. Preferences that genuinely must
apply before paint may mutate DOM attributes/classes only through
`SyncBootScript`; they must not dispatch Redux state before hydration.

## Verification

`lib/sync/components/SyncBootstrap.test.tsx` renders the subject on the server,
hydrates it with `hydrateRoot`, and proves sync boot remains closed until the
post-load idle callback, after descendant layout work, with no recoverable
hydration errors.

## Change log

- 2026-09-27 — **A warm-cache write sends only what this tab changed.** The
  write scheduler keeps a per-slice BASE — the record as of the last load
  (REHYDRATE / `empty`; a slice may supply it via `remote.baseline`), advanced
  to each body it successfully writes — and hands it to `remote.write` as
  `ctx.base`. `userPreferences` diffs body against base at `module.field` and
  merges only those keys into the live row via `mergeJsonColumn` (CAS on the
  new `users.user_preferences.version` column, bumped by `trg_touch_row`).
  Before this the policy wrote its WHOLE cached record, so a stale tab put
  back every key changed elsewhere (live, 2026-09-27: an agent's
  default-organization write reverted 15s later). Two freshness rules came
  with it: `remote.revalidateOnBoot` (a cache hit still paints, and the fetch
  fires at once as a `stale-refresh`) and `remote.revalidateOnFocus` (refresh
  when the tab comes back, at most every 5s). A background refresh never lands
  over unsaved edits: it is skipped while a write is pending and its answer is
  dropped if an edit arrived mid-flight (`isRemoteWritePending`). Guard:
  `lib/redux/preferences/__tests__/preference-writes-never-clobber.test.ts`
  (red on the old whole-record write, green now).
- 2026-09-26 (later) — Two policy hooks close the "failed load overwrites
  the saved record" hole. `persistWhen(state)` is checked by the debounced
  write scheduler's flush (`engine/remoteWrite.ts` `flushOne`) — the ONE path
  every warm-cache write takes (debounce, pagehide, programmatic flush) — and
  a not-ready slice's body is DROPPED, never stored to IDB, its mirror, or
  `remote.write`. `persistAfterLoad(state)` is asked after a load outcome for
  THAT slice; true = persist now (the slice replayed held edits onto the real
  record). Warm-cache only (`definePolicy` refuses otherwise). And a startup
  sync that throws — `bootSync`, `resyncForIdentity`, the fallback scheduling,
  or store.ts's boot chain — calls `announceLoadFailure`, so every
  remotely-loaded slice gets a `failed` outcome with the error, never
  "loading" forever. Guard: `lib/redux/preferences/__tests__/preferences-load-status.test.tsx`.
- 2026-09-26 — Every `invokeRemoteFetch` now announces its load outcome as
  `sync/remoteFetchStatus` (`engine/remoteFetchStatus.ts`): phase `started`,
  then `empty` (answered, no record) or `failed` (threw / undeserializable, with
  the error in words); success is still the REHYDRATE. Before this a failed
  read dispatched NOTHING, so a slice could not tell "load failed" from
  "nothing saved" and screens rendered defaults as the person's data. The
  middleware treats the status action like a REHYDRATE — never persisted, never
  broadcast — because persisting after a failed load would write the defaults
  over the saved record (guard: `lib/redux/preferences/__tests__/preferences-load-status.test.tsx`,
  proven red with the skip removed). A policy's `remote.fetch` must THROW on a
  read error; returning null means "no record". First consumer:
  `userPreferences._meta.loadStatus`.
- 2026-09-24 — Boot's IndexedDB pass reads every warm-cache slice in ONE
  bounded `readSlices` (`bulkGet`) call instead of a per-slice loop. Each loop
  read carried its own 1s timeout, so a stalled browser IDB summed to ~16s and
  fired the 8s "persisted hydration did not settle" error on /notes (D345).
  Never reintroduce a per-slice IDB loop on the boot path; the guard in
  `engine.boot.idb.test.ts` stalls 16 slices and fails if you do.
  Second path to the same error, closed the same day: the 8s backstop counted
  from first render, while `SyncBootstrap` defers boot to window load + idle
  with no bound. Now boot is capped at `BOOT_DEFER_CAP_MS` (5s, announced with
  a `[sync] boot deferred` warning; idle carries a 1s timeout), and the
  backstop arms only when `store._sync.bootStarted()` turns true — it measures
  the engine, never the page load. Guards: `SyncBootstrap.test.tsx` (cap) and
  `__tests__/useSyncHydrated.test.tsx`, both red on the old code.
- 2026-09-12 — The engine can now be ASKED whether persisted state has finished
  loading: `store._sync.hydrationSettled()` / `onHydrationSettledChange()`, and
  the `useSyncHydrated()` hook over them. Until this existed no consumer could
  tell "this cache holds nothing" from "this cache has not been read yet", so a
  surface that restores state rendered a confident lie for the first few
  hundred milliseconds (W43: the Masterwork guided start drew step 2 from
  default answers while the Expert's real ones were still in IndexedDB;
  `ensureOrgId` hand-rolled `await _sync.boot()` for the same reason). Settled
  means boot AND any identity resync it triggered have finished — the
  signed-in person's records are read on that second pass, not at boot. The
  hook never hangs: after `HYDRATION_BACKSTOP_MS` (8s) it screams and reports
  settled, because a surface stuck on a spinner forever is the worse failure.

- 2026-08-27 — Persisted boot reschedules while React still exposes a pending
  streamed Suspense boundary; browser idle alone did not close the Notes #418 race.
- 2026-08-26 — Persisted boot now waits for window load plus browser idle; a parent passive effect
  can precede selective hydration in a streamed Suspense subtree and still produce React #418.
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
