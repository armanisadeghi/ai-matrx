Before I give you the design, let me answer your upstream question directly, then lay out the architecture. This is exactly the kind of decision that deserves careful design before code, so I'll stay in discussion mode for now — once you sign off on the shape, we can execute.

## Can a new tab grab state from existing tabs without refetching?

**Yes, fully.** This is one of the most elegant things you can do with `BroadcastChannel`. The pattern is called **peer hydration** (or "leader election" in distributed-systems terms). It works like this:

```
New tab boots
  ↓
Post { type: "HYDRATE_REQUEST", keys: ["aiModels", "preferences", ...], nonce: "abc123" }
  ↓ (listen for ~150ms)
Any existing tab replies: { type: "HYDRATE_RESPONSE", nonce: "abc123", data: {...} }
  ↓
First response wins. Hydrate Redux. Done. Zero network calls.
```

Fallback chain if no peer responds in 150ms:
1. Read from IndexedDB (stale-but-instant)
2. Fetch from server (fresh)

So your new tab boots to a fully populated Redux store in single-digit milliseconds when at least one other tab is open, and never waits on a server round-trip for cacheable data. The user's experience: every tab after the first feels **instant**, permanently.

## Is the "pizza menu" viable?

**Yes, and it's the right abstraction.** What you're describing is a well-known pattern called **declarative persistence policies**. Redux Persist has a primitive version; libraries like RTK Query have a richer one; Dexie + Redux combos do it too. None of them combine all three tiers (memory / Web Storage / IndexedDB / peer hydration / broadcast) under one descriptor, which is why you haven't found the exact thing you want. Building it yourself is 100% viable and actually not that much code — maybe 600-900 lines for the whole core.

The trick is: **one descriptor per slice, one engine that reads descriptors**. Every slice ships with a `syncPolicy` export, and the engine handles everything on boot, every action, and on shutdown. You never touch storage/broadcast code again when adding a new slice — you just pick the package.

## The architecture

Here's the exact structure. Four layers, one entry point.

### Layer 1: The pizza menu (policy presets)

Five named packages. Any slice picks one.

| Preset | Memory | localStorage | IndexedDB | Broadcast actions | Peer hydrate | Use for |
|---|---|---|---|---|---|---|
| `volatile` | ✓ | ✗ | ✗ | ✗ | ✗ | Form inputs, transient UI, modal state |
| `ui-broadcast` | ✓ | ✗ | ✗ | ✓ | ✓ | Live selection, active tab, "who's typing" |
| `boot-critical` | ✓ | ✓ | ✗ | ✓ | ✓ | Theme, sidebar collapsed, locale — needs sync-read on first paint |
| `warm-cache` | ✓ | ✗ | ✓ | ✓ | ✓ | AI models, agent defs, shortcuts, context menu, notes tree, user context tree |
| `live-data` | ✓ | ✗ | ✓ | ✓ | ✓ + realtime refresh | Active notes being edited, chat messages (adds Supabase subscription) |

Default is `volatile`. Slices without a policy are untouched. This is the "custom pizza" escape hatch — anything exotic still works because nothing is mandatory.

### Layer 2: The policy descriptor (what you write per slice)

This is the entire contract a developer writes when adding a new slice to the system:

```ts
import { definePolicy } from "@/lib/sync";
import aiModelsReducer, { aiModelsSlice } from "./aiModelsSlice";

export const aiModelsPolicy = definePolicy({
  slice: aiModelsSlice.name,        // "aiModels"
  preset: "warm-cache",              // pizza choice
  version: 3,                        // bump to invalidate all caches
  broadcast: {
    actions: [                       // actions that replay across tabs
      "aiModels/modelAdded",
      "aiModels/modelUpdated",
      "aiModels/modelDeleted",
    ],
  },
  hydrate: {
    fallback: async () => fetchAiModels(), // server fetch when all else fails
    staleAfter: "1h",                      // after this, refetch in background
  },
});
```

That's it. No storage code, no channel code, no middleware, no effects, no sagas. The preset handles everything else.

For the simpler presets, it's even shorter:

```ts
export const themePolicy = definePolicy({
  slice: "theme",
  preset: "boot-critical",
  version: 1,
});
```

### Layer 3: The engine (one system, written once)

The engine is a single module that:

1. **On app boot** (runs in `Providers` before React renders children):
   - Opens `BroadcastChannel("matrx-sync")`
   - Reads all `boot-critical` slices from `localStorage` (synchronous, no flash)
   - Broadcasts `HYDRATE_REQUEST` for `warm-cache` slices, waits 150ms for peer responses
   - For keys without a peer response: reads IndexedDB → falls back to server fetch
   - Returns the fully hydrated `initialReduxState` to `<Providers>`

2. **Middleware installed in the store** (runs on every dispatch):
   - Checks if the action matches a broadcast list → rebroadcasts with `__fromBroadcast` tag
   - Checks if the action mutates a persisted slice → schedules a debounced write (100ms) to localStorage/IndexedDB
   - Ignores actions tagged `__fromBroadcast` when rebroadcasting (loop prevention)

3. **Channel listener** (runs once):
   - `HYDRATE_REQUEST` → replies with current store state for the requested slices
   - `HYDRATE_RESPONSE` → resolves the pending boot promise (only the first response per nonce)
   - Any tagged action → `store.dispatch({ ...action, __fromBroadcast: true })`

4. **Unload hook:**
   - Flush pending debounced writes so nothing is lost on tab close.

One file. Maybe 400 lines including types and comments. Every slice that opts in gets the whole package.

### Layer 4: Registration (the single menu counter)

One file where every slice gets registered — this is your menu:

```ts
// lib/sync/registry.ts
import { aiModelsPolicy } from "@/lib/redux/slices/aiModelsSlice";
import { themePolicy } from "@/lib/redux/slices/themeSlice";
import { agentDefinitionsPolicy } from "@/features/agents/redux/agentSource";
import { notesTreePolicy } from "@/features/notes/redux/notesTreeSlice";
// …

export const syncPolicies = [
  themePolicy,
  aiModelsPolicy,
  agentDefinitionsPolicy,
  notesTreePolicy,
];
```

To add a new feature: (1) write its slice, (2) export one `definePolicy` call, (3) add it to this array. Done. Sync, broadcast, localStorage/IndexedDB persistence, peer hydration, version invalidation — all automatic.

## The data flow, end to end

Here's what happens for a `warm-cache` slice like AI models:

**First tab ever opens** (cold start):
1. Engine reads `boot-critical` from localStorage (theme applies before first paint — no FOUC)
2. Engine broadcasts `HYDRATE_REQUEST` → no peers respond
3. Engine reads IndexedDB → empty (first ever visit)
4. Engine calls `fallback()` → fetches AI models from server
5. Dispatches `aiModels/hydrated` → reducer populates store → middleware writes to IndexedDB

**Second tab opens** 30 seconds later:
1. Reads localStorage for theme (instant, no flash)
2. Broadcasts `HYDRATE_REQUEST`
3. First tab replies in ~2ms with current AI models
4. Store populated. Zero network, zero IndexedDB read. Tab is usable instantly.

**User adds a model in tab 1:**
1. Tab 1 dispatches `aiModels/modelAdded`
2. Middleware sees it's in the broadcast list → posts `{ action, __fromBroadcast: true }`
3. Tabs 2, 3, ..., 15 receive it → dispatch locally → their stores update
4. All tabs write the new state to IndexedDB (debounced; the last-debounce-wins means effectively one write)

**User closes all tabs, reopens later:**
1. No peers, reads IndexedDB → instant hydration with last-known state
2. Engine checks `staleAfter` → if exceeded, kicks off a background refresh
3. Refresh dispatches a new action → cycle repeats

## Sagas vs middleware

You asked about sagas — my recommendation: **don't use sagas for this.** Sagas are powerful but overkill and add a conceptual layer you don't need. A plain Redux middleware is cleaner for broadcast because:

- Broadcast is pure action-in → action-out. No async orchestration.
- Middleware runs synchronously in the dispatch pipeline, so the broadcast goes out in the same tick as the local update. No ordering weirdness.
- Hydration has one async phase (boot) and one background phase (stale refresh). Both are done more clearly as module-level async functions, not saga effects.

Use sagas (or RTK listener middleware) only for things that need to react to actions with complex async workflows. For sync, the middleware is ~30 lines.

## Things you'll want to decide explicitly

Five design calls worth making up front so the system doesn't grow ad-hoc:

1. **Conflict resolution.** When tab A and tab B edit the same note at the same second, who wins? Options: last-write-wins (simplest, fine for user-owned data), version counters (safer, more code), or CRDT (overkill unless collaborative editing). I'd start with last-write-wins and layer versioning only for slices that need it.

2. **Scope of broadcast.** All slices share one channel (`matrx-sync`) vs. one channel per slice. One channel is simpler and totally fine under 1000 actions/sec. Multiple channels only matter at extreme scale.

3. **Guest vs authenticated.** Peer hydration should respect user identity. If tab A is signed in as Alice and tab B is signed in as Bob (different browser profile? unlikely but possible), they must not share state. Include `userId` in the `HYDRATE_REQUEST` — peers only reply if it matches.

4. **Schema versioning.** When a slice's shape changes, bumping `version` in the policy invalidates IndexedDB + peer responses for that key. The engine compares versions and drops stale data silently. This prevents deployed-app-meets-stale-cache bugs.

5. **"Secret" slices.** Tokens, draft messages — things you never want to broadcast or persist. The `volatile` preset covers this; just be disciplined about using it.

## My recommendation on sequencing

This is a significant system. I'd build it in three visible phases so you get value fast:

- **Phase 1 (core, ~1 day):** Engine, registry, middleware, `volatile` + `boot-critical` + `ui-broadcast` presets. Wire `theme` as the first customer. Verify multi-tab sync works.
- **Phase 2 (IndexedDB, ~1 day):** Add `warm-cache` preset with Dexie-backed persistence + peer hydration. Wire `aiModels` as the first customer. Verify peer-hydrate-on-new-tab works.
- **Phase 3 (migration, ongoing):** Move each existing slice to the system one at a time. Each migration is a single `definePolicy` export + registry entry. No code in the slice itself changes.

## Is this viable?

Yes — and it's the right call for an app that will have logged-in users with 5-15 tabs open across research sessions. Once it's in, you never think about persistence or tab sync again when building features. You just pick your pizza.

## Before we build

A few things I'd want to confirm with you:

1. **Dexie for IndexedDB?** It's the standard, tiny, excellent ergonomics. Alternative is raw `idb` or native IDB (painful). I'd use Dexie.
2. **Strict per-user isolation** — do you have `userId` reliably available synchronously at boot (e.g. from a cookie / SSR-hydrated Redux state)? Looking at your layout it looks like yes (the `(ssr)/layout.tsx` puts `userData` into `initialReduxState`). Good.
3. **First slice to migrate** — what's the smallest, most valuable slice to prove the system works end-to-end? I'd suggest `theme` (because FOUC-free theme sync across tabs is immediately visible) followed by `aiModels` (because peer hydration on new tabs is dramatic to demo).
4. **Scope for Phase 1** — should I build the core + a working demo that syncs theme and one `warm-cache` slice across tabs, or go all-in and migrate 3-4 real slices at once?

If this all matches what you're thinking, tell me which of the 4 points above you want to pin down, and I'll switch into plan mode and produce a concrete file-by-file implementation plan (paths, exports, API, migration steps) before we touch code.


---

# Updated after core non-negotables communication

## Armman:
**Engineering Governance Principles — Operating Constitution**

These principles govern every architectural and implementation decision in this codebase. They are not guidelines; they are invariants.

**Canonical Implementations Only.** For any given concern — storage, routing, auth, data access, UI primitives, etc. — exactly one implementation is canonical. Parallel systems solving the same problem are defects. When evaluating an existing system, the verdict must be binary: it is either the pattern to propagate everywhere, or it is scheduled for deletion. "Keep it as-is" is not an allowed outcome.

**No New System Without a Deprecation Path.** Every proposal to build something new must include three parts: (1) what is being built, (2) what existing systems it replaces, (3) the migration sequence and deletion trigger for the replaced systems. Proposals missing any of the three are incomplete and will be rejected. The migration itself may take time; the plan must exist from day one.

**Strangler Fig Migrations.** New systems are introduced behind an interface compatible with what they replace. Callers are migrated incrementally. The old system is deleted the moment the last caller is migrated — not after a review, not "when we get to it." The deletion trigger is defined upfront.

**Net-Negative Code.** Every change is expected to reduce total codebase size. Additions must be accompanied by deletions at a meaningful ratio. PRs that grow the codebase without a deletion commitment will be challenged. The codebase is considered over-weight; all work is subtractive by default.

**Union-of-Capabilities Target Architecture.** When consolidating multiple variants of a system into one, the target must possess the union of desirable properties from all variants — not a compromise, not a subset. If the replacement lacks a capability the old system had, that's a blocker until resolved.

**No Permanent Coexistence.** Feature flags, compatibility shims, and parallel implementations are acceptable only during an active migration window with a defined end date. Permanent coexistence of two systems solving the same problem is prohibited.

**Vocabulary.** Use precise language: "replace" implies deletion; "add" implies growth. Developers must be explicit about which they are proposing and justify any addition that is not also a replacement.

**Cultural Default.** The correct instinct when encountering an inadequate system is "rebuild it properly and migrate everything onto the new one," not "build one more alongside it." The latter is how the codebase got into its current state and is no longer an acceptable pattern.

## Agent
Got it. Reset done. I inventoried every overlapping system and it's worse than I thought — there's a **graveyard of half-built storage/sync attempts**. Your rule is correct: we delete all of it and one system wins.

## What I found (the deletion inventory)

Every one of these overlaps with what we're building. Under your rules, they all must converge or die:

| System | File(s) | Status today | Fate under new system |
|---|---|---|---|
| IDB abstract class hierarchy | `lib/idb/store-manager.ts`, `store-interface.ts`, `feature-store.ts`, `hooks/idb/useDb.ts` | Only used by audio | **DELETE** — rebuild audio on sync engine |
| Audio IDB store | `hooks/idb/useAudioStore.ts`, `features/audio/services/audioSafetyStore.ts` | Active | Migrate to sync engine |
| LocalFileSystem IDB | `utils/file-operations/LocalFileSystem.ts` | Unclear usage | Migrate or delete |
| Local storage manager | `hooks/common/useLocalStorageManager.ts` (260 lines, async-wrapped-sync) | Used in ~5 places | **DELETE** |
| Preferences middleware | `lib/redux/middleware/preferencesMiddleware.ts` | **Dead code** — not wired into store | **DELETE NOW** |
| Preferences thunks | `userPreferencesSlice.ts` — `savePreferencesToDatabase`, `loadPreferencesFromDatabase` | Active, redundant with middleware | **DELETE** after migration |
| Notes auto-save | `features/notes/redux/autoSaveMiddleware.ts` | Active | Fold into sync engine |
| Prompts auto-save | `features/prompts/hooks/usePromptAutoSave.ts` | Active | Fold into sync engine |
| Agents auto-save | `../aidream/apps/shared/chat/src/agents/hooks/useAgentAutoSave.ts` | Active | Fold into sync engine |
| Panel persistence | `features/window-panels/hooks/usePanelPersistence.ts` | Active | Fold into sync engine |
| Query history storage | `components/admin/query-history/query-storage.ts` | Active | Fold into sync engine |
| Cache middleware | `utils/cache/cacheMiddleware.ts` | Active | Fold into sync engine |
| Form state cache | `utils/cache/formState.ts` | Active | Fold into sync engine |
| Inline theme script | `app/layout.tsx` | Active, FOUC-prevention | Keep the *concept* — rewrite as a sync-engine pre-paint hook |
| Theme hooks | `hooks/useTheme.ts`, `ThemeScript.tsx` | Active | Consolidate into sync engine's theme policy |
| Ad-hoc `localStorage.*` calls | 40+ files | Scattered | Convert every site to sync engine |
| SSR Supabase pref fetch | `(a)/layout.tsx`, `(ssr)/layout.tsx` | Active | **DELETE** — sync engine handles it |
| React Query | `ReactQueryProvider` in `Providers.tsx` | Active | See Q2 below |

Rough line count being deleted: **~2,500-3,000 lines** if we go all the way. Lines added for the sync engine: **~800-1,200**. Your 3:1 ratio comfortably met.

## The five decisions I need from you

I'm going to make strict recommendations on each. You veto or approve. These aren't "which flavor" — they're "what is the one permanent right answer under your rules."

### D1 — `userSlice` with mixed secret/profile fields

**Strict recommendation: split into two slices.** `userProfile` (persistable, broadcastable) + `userAuth` (volatile, never leaves memory). No field-exclusion escape hatch, ever. This establishes the rule: **a slice is either fully safe to persist or fully volatile. If you have both kinds of data in one slice, you split.** Anyone reading the codebase knows exactly what's being persisted just by looking at which slices have policies.

### D2 — React Query

You have `@tanstack/react-query` wrapping everything. It's a third cache layer alongside Redux and whatever-half-system is currently caching things. Under your principles, it has to go OR get a very narrow, documented purpose.

**Strict recommendation: remove it.** The sync engine becomes the only client cache. Anything React Query is doing today falls into one of three buckets:
- **Cross-tab shareable cached data** (AI models, agent defs, notes tree) → sync engine `warm-cache`.
- **Ephemeral request-response** (one-off mutations, search results that don't need caching) → just dispatch actions / thunks, no cache needed.
- **Genuine "fetch + invalidate" patterns** that are hyper-local to one component → RTK Query (which is already in your RTK toolchain) or plain thunks. Not a third library.

If removing React Query is too big for Phase 1, we keep it alive but **freeze new usage** immediately and delete during Phase 5. The plan documents its death explicitly.

### D3 — Per-feature auto-save (notes, prompts, agents, panels)

Each feature has its own half-baked auto-save. Under your rules, these must all be the same mechanism.

**Strict recommendation: delete all of them, migrate to a single `autoSave` policy on the sync engine.** The policy declares: "when this slice changes, debounce X ms, persist locally, and call this function to persist to the server." One mechanism, one debounce behavior, one error handling path, one loading indicator convention. Every feature gets it for free.

### D4 — IDB rebuild

The `FeatureStore` class hierarchy is awkward but small. `idb` (the package, not the wrapper) is solid.

**Strict recommendation: delete the entire `lib/idb/*` + `hooks/idb/*` wrapper layer.** Keep the `idb` package. The sync engine owns a single shared DB (`matrx-sync`) with stores partitioned by slice name. Audio/voice-notes/transcripts get migrated into it as slices with `warm-cache` policies. Everything that touches IDB goes through one surface.

I also want to flag: **consider Dexie once more.** The `idb` package is low-level (promise-wrapped raw IDB); Dexie is higher-level (schema, queries, hooks, observables). For ~15 different sliceable caches, Dexie saves real code. That said, if you have a preference based on bundle size or philosophy, `idb` is perfectly fine. My slight lean is Dexie *only if* it saves meaningful code — otherwise stick with `idb`. Happy either way.

### D5 — Route group consolidation

You mentioned `(a)` is the permanent home and `(ssr)`, `(authenticated)`, `(public)` all go away eventually. I want to confirm the **migration order** because it affects the sync engine's assumptions:

**Strict recommendation: the sync engine is built targeting `(a)` only.** Its API and lifecycle assume `(a)`'s layout patterns. `(ssr)/(authenticated)/(public)` are not supported by the sync engine. Each route in those groups is migrated to `(a)` one by one; any route not yet migrated keeps its existing ad-hoc approach until it's moved. This means we never build abstractions to bridge the old groups; we just migrate.

Once every route is in `(a)`, delete the other three groups entirely.

---

## What I'll do with the decisions

Once you confirm or push back on each of D1–D5, I'll:

1. **Rewrite `decisions.md`** from scratch with the new framing: non-negotiable principles at the top, the full deletion inventory, then the locked decisions. This becomes the durable source of truth.
2. **Write `phase-1-plan.md`** — concrete file-by-file plan for Phase 1 only, including:
   - Every file created
   - Every file deleted (yes, deletions in Phase 1)
   - The real demo route under `(a)` proving Phase 1
   - A verification checklist (real multi-tab tests, not mocked)
3. **Add migration stubs** for every item in the deletion inventory — one line per item: "Phase X: delete, replaced by Y." So no item is forgotten.

Nothing gets coded until both docs exist and you've signed off on them.

## One more thing I want you to think about

You haven't directly answered but it's implicit in your principles: **server-side caching.** Supabase reads from the server (both SSR and client-initiated) are also a caching decision. If your long-term vision is "everything goes through the sync engine," does that include:
- **Server-side fetches in RSCs** — do we cache those at all, or always fetch live? Next.js `'use cache'` is a separate system.
- **Client-initiated Supabase reads** (post-boot, when user clicks something and triggers a fetch) — do those also go through the sync engine?

My strict recommendation: **yes to both.** Every cache in the app is the sync engine. RSCs do `'use cache'` only for public/anonymous content that benefits from CDN; anything user-specific goes through the sync engine on the client. This is an even bigger unification than we've been discussing — but it matches your principle. Worth deciding now so the sync engine's API supports it from day one.

---

**Your move:** approve, modify, or veto D1–D5 plus the server-cache question. Once locked, I rewrite the decisions doc clean and we move to Phase 1 planning.