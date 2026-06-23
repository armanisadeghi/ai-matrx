# Sync / Broadcast / Storage — Decisions

Single source of truth for the unified client-side state persistence, cross-tab broadcast, and cache system. One line per decision. Append-only edits — older decisions can be marked superseded but never silently rewritten.

Last updated: 2026-04-20.

Related docs:

- `phase-1-plan.md` — concrete Phase 1 implementation plan
- `initial-discussion.md` — original brainstorm (historical; this doc supersedes)

---

## 1. Non-negotiable principles

- **N1** — Exactly one system for client persistence, broadcast, and cache. No parallel systems, ever.
- **N2** — No legacy support. When something is replaced, it is deleted, not preserved alongside.
- **N3** — Every feature uses the same public API. No per-feature hooks, classes, or bespoke middleware.
- **N4** — Every phase ships with real demos, real multi-tab verification, and real deletions. Nothing is "coming later" without a named phase.
- **N5** — Graceful degradation: if any part of the system is unavailable (no cache, no peers, no network), the app still works at baseline speed. Never block first paint on network or peer I/O. Synchronous localStorage reads are the only awaited work during boot; everything else is background.
- **N6** — For every line added to the codebase, at least three lines are deleted in the same or a named future phase.
- **N7** — The permanent route home is `app/(a)/`. The sync engine is built for `(a)` only. `(ssr)`, `(authenticated)`, `(public)` are migrated in and deleted.
- **N8** — Enterprise-grade: type-safe end to end, observable, unit-testable in isolation, identity-scoped, schema-versioned, no magic.

## 2. Core objectives

- **O1** — Near-instant first paint on the client (unlocked by pre-paint localStorage + peer hydration). Significantly faster SSR page loads is a downstream result of Phase 3 (removing blocking server fetches), enabled by this system but not caused by the sync engine itself.
- **O2** — Client islands read from the sync layer first; server only when cache misses.
- **O3** — Near-zero FOUC. Pre-paint state (theme, locale, layout) applied before first render.
- **O4** — New tabs feel instant (<10ms to usable) when any other tab is open.
- **O5** — Adding a new feature = declare one policy + register it. Persistence/broadcast/hydration are automatic.

## 3. Architecture (locked)

- **A1** — Four layers: (1) preset menu, (2) per-slice policy descriptor, (3) engine, (4) central registry.
- **A2** — Slices opt in via `definePolicy(...)` colocated with the slice file, plus one entry in `lib/sync/registry.ts`.
- **A3** — Slices without a policy are untouched (zero impact).
- **A4** — Cross-tab metadata lives on `action.meta` (FSA-compliant), never on the action root. `action.meta.fromBroadcast = true` marks rebroadcast inbound actions so middleware does not re-emit them.
- **A5** — Persistence timing is per-preset: `boot-critical` writes through on every action (small, hot, never debounced); `warm-cache` (Phase 2+) debounces ~100ms and force-flushes on `pagehide`. Debouncing is never applied to `boot-critical` because mobile `pagehide` is unreliable and the IO cost is trivial.
- **A6** — Each policy carries a `version` number; changing it invalidates cached + peer-offered data. **Until the schema-migration helpers land (Q5 in Phase 2/6), bumping `version` destroys client data for that slice.** `definePolicy` JSDoc must warn loudly about this for every caller.
- **A7** — All caches are scoped by identity (`auth:{userId}` or `guest:{fingerprintId}`).
- **A8** — Peer hydration replies only when the requester's identity matches; no cross-identity data leakage.
- **A9** — Identity change (sign-in, sign-out, fingerprint rotation) purges all in-memory + persisted caches for the prior identity.
- **A10** — Single shared `BroadcastChannel("matrx-sync")` for all slice traffic. Per-slice channels only if traffic analysis forces it.
- **A11** — Single shared IndexedDB (`matrx-sync`) via Dexie. One object store per sliceName. Records keyed by `{identityKey}:{sliceName}:{version}`.
- **A12** — Boot hydration order: localStorage (sync) → peer broadcast (~150ms timeout) → IndexedDB → server `fallback()` → `initialState`.
- **A13** — Block rendering only for `boot-critical` hydration. `warm-cache` and `live-data` hydrate async and stream in.
- **A14** — The engine is unit-testable without a DOM: all side-effect sinks (channel, localStorage, IDB) are injected.
- **A15** — Persisted presets (`boot-critical`, `warm-cache`, `live-data`) support an optional declarative `partialize` field — a positive allow-list of top-level slice keys to persist. Unlisted keys stay in memory. This is not an escape hatch — it is the explicit mechanism for excluding transient UI fields (`isLoading`, errors, AbortControllers) from persistence while keeping one coherent slice. When secrets or auth concerns differ semantically from the rest of the data, a slice split is still required (see D1).
- **A16** — `boot-critical` policies may declare `prePaint` as either a single `PrePaintDescriptor` or an array of them. Each descriptor supports an optional `systemFallback` ({ mediaQuery, applyWhenMatches }) that fires only when storage is empty or malformed — this is how we honour the user's OS dark/light preference on first visit without hand-written scripts. Exact shape defined in `phase-1-plan.md` §5.4.

## 4. Presets (locked names and semantics)

- **P1** — `volatile` — memory only; no persist; no broadcast. Default for unpolicied slices.
- **P2** — `ui-broadcast` — memory + cross-tab broadcast + peer hydration; no persist.
- **P3** — `boot-critical` — localStorage + broadcast + peer hydrate + pre-paint read. Small, hot data only (<10 KB per slice).
- **P4** — `warm-cache` — IndexedDB + broadcast + peer hydrate + debounced persist. Optional `staleAfter` triggers background refresh.
- **P5** — `live-data` — `warm-cache` + Supabase Realtime subscription. Added in Phase 11.

A slice has exactly one preset. No mixing. If a slice needs different preset behavior for different fields (e.g., part needs persistence + broadcast, another part is purely server-state with no broadcast), it must be split. Note: excluding transient UI fields (`isLoading`, errors, controllers) from persistence does NOT require a split — use `partialize` (A15).

## 5. Locked architectural decisions

- **D1** — `userSlice` is split into `userProfile` (persistable) and `userAuth` (volatile). Splits are required when data has **semantically different concerns** (auth secrets vs. profile data, public vs. private, server-owned vs. client-owned). Transient UI fields within a semantically coherent slice (`isLoading`, errors, AbortControllers) are excluded via the declarative `partialize` whitelist on the policy (A15), not by splitting. General rule: **split for semantics, `partialize` for transients.** (Executed: Phase 4.)
- **D2** — React Query is removed. New usage is frozen immediately; existing usage migrates to sync engine or plain RTK thunks and the library is uninstalled. (Executed: Phase 7.)
- **D3** — All per-feature auto-save hooks and middleware (notes, prompts, agents, panels, query history, form state) are replaced by a single `autoSave` capability on the sync engine. (Executed: Phase 5.)
- **D4** — The entire `lib/idb/*` + `hooks/idb/*` wrapper hierarchy is deleted. Dexie replaces raw `idb`. Audio, voice notes, transcripts, LocalFileSystem migrate onto the sync engine's shared Dexie DB or a sibling Dexie DB owned by `lib/sync/`. (Executed: Phase 6.)
- **D5** — Route groups `(ssr)`, `(authenticated)`, `(public)` are migrated route-by-route into `(a)` and then deleted. The sync engine supports only `(a)`. No bridge abstractions are built. (Executed: Phase 9.)
- **D6** — Server-side caching is unified with the client sync engine. RSCs use Next.js `'use cache'` only for fully anonymous, public content (marketing, docs, public applet catalog). Any user-specific data goes through the sync engine on the client. (Executed: incrementally per-route during Phases 3 & 9.)
- **D7** — Pre-paint `boot-critical` data is applied via a single `<SyncBootScript />` component rendered in `<head>`. It replaces all existing inline theme scripts and is policy-driven — no feature writes its own boot script. (Executed: Phase 1.)
- **D8** — Server → client pre-paint handoff uses cookies for anonymous-or-first-visit data (where localStorage is unavailable at SSR time). Server-set cookies, client-readable. Sync engine emits cookie writes on behalf of `boot-critical` policies. (Executed: Phase 3.)

## 6. Implementation choices (locked)

- **I1** — State management: Redux Toolkit. `redux` = RTK throughout this doc.
- **I2** — Sync middleware: RTK middleware (NOT sagas). `redux-saga` is retained only for existing async workflows; new work does not use it.
- **I3** — IndexedDB: Dexie 4+. (`idb` package is uninstalled in Phase 6.)
- **I4** — Broadcast: native `BroadcastChannel` API. No polyfill; we require modern browsers.
- **I5** — Channel message schema: versioned discriminated-union TypeScript types. Zod 4 validates every inbound message in development; production uses a cheap discriminant + shape check to avoid hot-path overhead. Both paths drop invalid messages with structured logs.
- **I6** — Sync engine lives at `lib/sync/` and is the single import surface: `import { definePolicy, bootSync, createSyncMiddleware } from "@/lib/sync"`.
- **I7** — Identity provided by `lib/sync/identity.ts`; derived from the existing `user.id` / `user.fingerprintId` at boot.
- **I8** — All sync logs go through a single prefixed logger (`[sync]`) with configurable verbosity for the debug panel (Phase 12).
- **I9** — Unit tests use Jest (already installed in the repo). No Vitest migration as part of this initiative.

## 7. Phase roadmap (summary)

Each phase has its own plan doc at `docs/concepts/full-sync-boardcast-storage/phase-N-plan.md` written immediately before execution.

- **Phase 0** — Finalize design. Decisions doc + Phase 1 plan + roadmap written. React Query usage audit produced (read-only inventory; no code changes) so D2 / Phase 7 execute with data, not assumption. No code. (Current phase.)
- **Phase 1** — Engine core + `volatile` + `ui-broadcast` + `boot-critical` presets + `theme` migration + demo route in `(a)` + SyncBootScript + delete legacy theme scripts & dead preferences middleware.
- **Phase 2** — Dexie persistence + `warm-cache` preset + peer hydration protocol + `userPreferences` migration + delete preferences thunks + delete `useLocalStorageManager`.
- **Phase 3** — SSR decoupling: `(a)/layout.tsx` stops fetching preferences. Cookie-based pre-paint handoff. Measure SSR latency drop.
- **Phase 4** — Split `userSlice` → `userProfile` + `userAuth`. Migrate all consumers.
- **Phase 5** — `autoSave` capability on sync engine. Migrate notes, prompts, agents, panels, query history, form state. Delete 6 per-feature auto-save systems.
- **Phase 6** — Delete `lib/idb/*` + `hooks/idb/*`. Migrate audio/voice/transcripts/file-system onto sync engine Dexie DB.
- **Phase 7** — Migrate React Query usage per the Phase 0 audit (sync engine where `fallback()` + caching fits; plain RTK thunks where the request is one-off). Uninstall `@tanstack/react-query`. If the audit reveals non-trivial usage of RQ's retry/backoff/dedup/suspense semantics, this phase adds the needed capabilities to the sync engine's `fallback()` contract **before** migrating — not a post-hoc rebuild inside feature code.
- **Phase 8** — Ad-hoc `localStorage.*` call cleanup. Every site audited, migrated, or justified. Scattered cache utils (`utils/cache/*`, `query-storage.ts`) folded in.
- **Phase 9** — Route group consolidation. Migrate every route from `(ssr)`, `(authenticated)`, `(public)` into `(a)`. Delete those three groups.
- **Phase 10** — RSC `'use cache'` policy for public content. Audit every server fetch; classify as public-cacheable or user-specific-via-sync-engine.
- **Phase 11** — `live-data` preset. Supabase Realtime subscriptions wired into slice lifecycle. Notes realtime + messaging realtime as first customers.
- **Phase 12** — Observability: dev-only debug panel showing hydration source, timing, cache hits per slice. Sync engine metrics into Sentry + Vercel Observability. Production verification tooling.

No phase is started until the prior phase's demo verification has passed. No phase is declared complete until all its named deletions have landed.

## 8. Deletion inventory (migration manifest)

Every overlapping system and ad-hoc cache, with the phase that deletes it. No item added outside a phase; no phase completes without its items deleted. This table is the durable record — check items off as they land.

| # | Item | Files | Deletion Phase | Replacement |
|---|---|---|---|---|
| 1 | Dead preferences middleware | `lib/redux/middleware/preferencesMiddleware.ts` | 1 | Sync engine middleware |
| 2 | Inline theme script | `app/layout.tsx` (script block) | 1 | `<SyncBootScript />` |
| 3 | Theme hooks/scripts | `hooks/useTheme.ts`, `features/shell/components/ThemeScript.tsx` | 1 | `theme` policy + sync engine |
| 4 | `useLocalStorageManager` | `hooks/common/useLocalStorageManager.ts` | 2 | Sync engine API |
| 5 | Preferences Supabase thunks | `savePreferencesToDatabase`, `loadPreferencesFromDatabase`, `saveModulePreferencesToDatabase` in `userPreferencesSlice.ts` | 2 | Sync engine `fallback()` + `autoSave` |
| 6 | SSR preferences fetch | `(a)/layout.tsx`, `(ssr)/layout.tsx` (the `getUserSessionData` + `user_preferences` calls) | 3 | Cookie pre-paint + client hydration |
| 7 | `userSlice` mixed fields | `lib/redux/slices/userSlice.ts` | 4 | Split: `userProfile` + `userAuth` |
| 8 | Notes auto-save | `features/notes/redux/autoSaveMiddleware.ts` | 5 | `autoSave` capability |
| 9 | Prompts auto-save | `features/prompts/hooks/usePromptAutoSave.ts` | 5 | `autoSave` capability |
| 10 | Agents auto-save | `features/agents/hooks/useAgentAutoSave.ts` | 5 | `autoSave` capability |
| 11 | Panel persistence | `features/window-panels/hooks/usePanelPersistence.ts` | 5 | `autoSave` capability |
| 12 | Query history storage | `components/admin/query-history/query-storage.ts` | 5 | Sync engine slice + policy |
| 13 | Form state cache | `utils/cache/formState.ts` | 5 | Sync engine slice + policy |
| 14 | Cache middleware | `utils/cache/cacheMiddleware.ts` | 5 | Sync engine middleware |
| 15 | IDB abstract hierarchy | `lib/idb/store-manager.ts`, `store-interface.ts`, `feature-store.ts` | 6 | Sync engine Dexie layer |
| 16 | IDB hooks | `hooks/idb/useDb.ts`, `hooks/idb/useAudioStore.ts` | 6 | Sync engine hooks |
| 17 | Audio safety store | `features/audio/services/audioSafetyStore.ts` | 6 | Sync engine slice |
| 18 | Local file system | `utils/file-operations/LocalFileSystem.ts` | 6 | Sync engine slice |
| 19 | React Query provider + deps | `providers/ReactQueryProvider.tsx`, `@tanstack/react-query` package | 7 | Sync engine or plain thunks |
| 20 | Ad-hoc `localStorage.*` calls | ~40 files (audit in Phase 8) | 8 | Sync engine API |
| 21 | Route group `(ssr)` | `removed (ssr) route group — **` | 9 | `app/(a)/**` |
| 22 | Route group `(authenticated)` | `app/(authenticated)/**` | 9 | `app/(a)/**` |
| 23 | Route group `(public)` | `app/(public)/**` | 9 | `app/(a)/**` or static routes |
| 24 | `ThemeProvider` context + `useTheme` context hook | `styles/themes/ThemeProvider.tsx` | 1 | `useAppSelector((s) => s.theme.mode)`; sync engine owns theme lifecycle |

New items discovered during a phase MUST be appended here before the phase is closed.

## 9. Open implementation details

These are deferred to their executing phase's plan. Not decided yet, not blocking Phase 1.

- **Q1** — Conflict resolution strategy per preset (LWW default; per-policy override allowed) — finalized in Phase 2.
- **Q2** — `staleAfter` granularity (per-slice vs per-field) — Phase 2; per-slice to start.
- **Q3** — Server `fallback()` contract: signature, error handling, retry — Phase 2.
- **Q4** — Peer hydration timeout tuning and backoff — Phase 2.
- **Q5** — Schema migration helpers for `version` bumps — Phase 2 or 6.
- **Q6** — Live-data subscription multiplexing across tabs (leader election) — Phase 11.
- **Q7** — DevTools API shape — Phase 12.
- **Q8** — Exact logger / observability hook surface — Phase 12.
