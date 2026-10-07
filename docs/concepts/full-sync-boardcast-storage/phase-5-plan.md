# Phase 5 — `autoSave` capability + per-feature deletions

> Phase 5 collapses six per-feature auto-save systems (manifest items #8–#14) into one declarative `autoSave` capability layered on the existing `warm-cache` preset. Closes the largest deletion target in the manifest: ~600 LoC of bespoke timer/echo-tracking middlewares + hooks.
>
> Reference docs: `decisions.md` (manifest #8–#14), `phase-2-plan.md` (`warm-cache` engine internals), audit report dated 2026-04-29 by general-purpose agent.

Status: **Executing** — Claude executes autonomously per Arman's 2026-04-29 direction ("massive push to get the rest of it done without my involvement").
Owner: Claude.
Preconditions: Phases 1–4 complete + theme fix `3e4ebd469` landed.

---

## 1. Scope reconciliation (pre-build audit findings)

The decisions.md manifest listed seven items (#8–#14). The audit found:

| # | Manifest item | Reality | Action |
|---|---|---|---|
| 8 | Notes auto-save (`features/notes/redux/autoSaveMiddleware.ts`, 231 lines) | Heaviest by far. Echo-suppression coupling with `realtimeMiddleware.ts`. Two echo sets: `_pendingDispatchIds` + `_savingNoteIds`. First-save materialization (INSERT vs UPDATE), auto-label generation, custom DOM event dispatch. | **Migrate last** — needs engine `isPendingEcho` API. |
| 9 | Prompts auto-save (`features/prompts/hooks/usePromptAutoSave.ts`, 88 lines) | Pure localStorage crash recovery. Singleton STORAGE_KEY. One consumer. | **Migrate first** (smallest blast radius). |
| 10 | Agents auto-save (`../aidream/apps/shared/chat/src/agents/hooks/useAgentAutoSave.ts`, 85 lines) | Per-record localStorage; recovery on mount via `mergePartialAgent({...,_skipDirty})`. One consumer. | Migrate second. |
| 11a | Code-files auto-save (`features/code-files/redux/autoSaveMiddleware.ts`, 69 lines) | Per-record + adaptive debounce + `saveFileNow` thunk. Read-only guard. ~5 consumers. | Migrate third. |
| 11b | Window-panel persistence (manifest said `usePanelPersistence.ts` — actual is `WindowPersistenceManager.tsx` + `WindowPanel.tsx` autosave block + `windowPersistenceService.ts`) | Visibility-flush + Context-driven. 44 consumers via `useWindowPersistence` API. | Migrate behind the existing API — single internal swap. |
| 12 | Query history (`components/admin/query-history/query-storage.ts`, 133 lines) | NOT actually auto-save — append-only LS list. 2 consumers. | Convert to a tiny Redux slice with `warm-cache` policy. |
| 13 | Form state cache (`utils/cache/formState.ts`, 40 lines) | Dead code (zero consumers). | **Delete only.** |
| 14 | Cache middleware (`utils/cache/cacheMiddleware.ts`, 118 lines) | Entire file commented out. | **Delete only.** |

## 2. Goals

- **G1** Add an optional `autoSave` config block to `PolicyConfig`. Layered on `warm-cache` (no new preset). Validates only on `warm-cache` policies.
- **G2** Build `lib/sync/engine/autoSaveScheduler.ts` — sibling to `remoteWrite.ts`. Per-record `Map<recordId, PendingAutoSave>` per slice. Hooks the same pagehide listener; same identity-swap cancel; same AbortController-per-write.
- **G3** Engine exposes two new APIs on the sync context:
  - `isPendingEcho(sliceName: string, recordId: string): boolean` — for `realtimeMiddleware.ts` to suppress its own echoes.
  - `flushAutoSave(sliceName: string, recordId?: string): Promise<void>` — programmatic flush (used by window panels' `visibilitychange` listener).
- **G4** Per-record optimistic state via declarative `autoSave.optimistic.{onStart,onSuccess,onError}` action creators — replaces the 6 hand-rolled `markSaving/markSaved/markError` reducers.
- **G5** Per-feature migrations (in order): prompts → agents → code-files → query-history → panels → notes.
- **G6** Delete dead code: `formState.ts` + `cacheMiddleware.ts` (zero consumers, fully commented).
- **G7** Net-negative: target ≥ 600 LoC deleted (six middlewares/hooks) vs. ≤ 400 added (engine + tests).

## 3. Explicit non-goals

- **N-G1** No new preset. `autoSave` is an additive config field on the existing `warm-cache` preset. Constitution II (one canonical implementation) — extending the engine, not duplicating it.
- **N-G2** No changes to slice schemas beyond removing `_dirtyFields` / `_pendingDispatchIds` / `_savingNoteIds` after the migration. Keep slice ergonomics for consumers.
- **N-G3** No changes to the realtime middleware's overall design — only its echo-check call site flips from `state.notes._savingNoteIds.includes(noteId)` to `engine.isPendingEcho("notes", noteId)`.
- **N-G4** Notes' first-save materialization (INSERT-vs-UPDATE) lives **inside** the policy's `autoSave.write` async function. Engine doesn't grow special insert/update branching.
- **N-G5** Notes' auto-label generation (currently in the middleware) moves to the **reducer** that handles `setNoteField` — it's a state mutation, not a side effect. Decoupled from auto-save.
- **N-G6** Window panels' 44-file consumer surface is **not** rewritten. The internal swap stays behind `useWindowPersistence` — only the implementation changes.
- **N-G7** No changes to consumers of the `saveFileNow` thunk (used by 3 explicit-save paths) — the autoSave.write for code-files calls the same thunk.

## 4. Architecture

### 4.1 New `PolicyConfig.autoSave` block

```ts
// lib/sync/types.ts
interface AutoSaveConfig<TState> {
  /** Slice key whose value is the per-record map (Record<id, T>). */
  recordsKey: keyof TState;
  /** Action allowlist that triggers a save. */
  triggerActions: readonly string[];
  /** Per-record predicate. Default: record._dirty === true. */
  shouldSave?: (record: any, recordId: string) => boolean;
  /** Constant or content-adaptive debounce. */
  debounceMs?: number | ((record: any, recordId: string) => number);
  /** Per-record write. Async. Returns the saved row or void. */
  write: (ctx: AutoSaveWriteContext<any>) => Promise<unknown>;
  /** Optimistic state actions, dispatched by the engine. */
  optimistic?: {
    onStart?: (recordId: string) => Action;
    onSuccess?: (recordId: string, saved: unknown) => Action;
    onError?: (recordId: string, error: string) => Action;
  };
  /** When true, engine tracks pending writes; consumed by realtime middleware. */
  trackEchoes?: boolean;
  /** Flush all pending records on pagehide. Default true. */
  flushOnHide?: boolean;
}
```

### 4.2 Engine integration

```
                   action lands
                       ↓
      sync middleware (existing)
          ↓                        ↓
   [warm-cache write?]      [autoSave.triggerActions match?]
          ↓                        ↓
   slice-level remote.write   per-record autoSaveScheduler.schedule()
                                     ↓
                              dirtyFor(recordId)
                                     ↓
                              debounceMs(record, id)
                                     ↓
                              write() → optimistic.onSuccess
                              (or optimistic.onError on throw)
                                     ↓
                              isPendingEcho(slice, id) flips
                              true → false in tracking set
```

### 4.3 Realtime echo suppression

`features/notes/redux/realtimeMiddleware.ts` line 54:

```diff
- if (state.notes._savingNoteIds.includes(noteId)) return;
+ if (syncEngine.isPendingEcho("notes", noteId)) return;
```

The `_savingNoteIds` slice field is deleted in the same PR — engine owns the source of truth.

## 5. PR shape

| PR | Scope | Risk |
|---|---|---|
| 5.A | This plan doc + audit doc | None |
| 5.B | Engine: `autoSaveScheduler.ts` + `definePolicy` extension + `isPendingEcho`/`flushAutoSave` exposed via `_sync` + tests | Low — additive |
| 5.C | Delete `utils/cache/formState.ts` + `utils/cache/cacheMiddleware.ts` (dead code) | None |
| 5.D | Migrate **prompts** (`usePromptAutoSave.ts` → policy on a tiny `promptDraft` slice) | Low |
| 5.E | Migrate **agents** (`useAgentAutoSave.ts` → policy on `agents` slice) | Low |
| 5.F | Migrate **code-files** (`autoSaveMiddleware.ts` → policy on `codeFiles` slice) | Low |
| 5.G | Migrate **query-history** (`query-storage.ts` → tiny `queryHistory` slice with warm-cache) | Low |
| 5.H | Migrate **window-panels** behind `useWindowPersistence` (44 consumers, internal swap only) | Medium |
| 5.I | Migrate **notes** + delete `_savingNoteIds`/`_pendingDispatchIds` + flip realtime echo check | High |
| 5.J | Verification doc + grep evidence + net-lines | None |

## 6. Risk register

| Risk | Mitigation |
|---|---|
| Notes echo loop reactivates if `_savingNoteIds` removed before engine `isPendingEcho` lands | Land 5.B (engine API) before 5.I (notes migration). |
| Prompts STORAGE_KEY co-read by error boundary breaks if migrated to IDB | Keep an LS mirror via warm-cache's `matrx:idbFallback:promptDraft` (already engine default). Error boundary reads the same key. |
| Window panels' visibility-flush double-debounces if engine adds its own debounce | Set `policy.autoSave.debounceMs = 0` for panels — engine flushes immediately on programmatic call. |
| Code-files' explicit-save thunks (`saveFileNow`, `useSaveActiveTab`, `useQuickSaveCode`) racing with autoSave timer | autoSave.write calls the same thunk; consumers keep working. Single source of truth at the thunk level. |
| Notes' auto-label generation moved from middleware to reducer changes dispatch order | Reducer dispatch is synchronous + idempotent; auto-label fires before the auto-save timer. Test coverage in slice tests. |

## 7. Definition of Done

1. Engine `autoSave` capability lands with ≥ 12 unit tests covering: trigger allowlist, dirty predicate, adaptive debounce, optimistic actions, abort/cancel, identity-swap, pagehide flush, isPendingEcho, programmatic flushAutoSave.
2. Six features migrated; six legacy auto-save sources deleted.
3. Two dead-code files (`formState.ts`, `cacheMiddleware.ts`) deleted.
4. Realtime middleware uses `isPendingEcho`; `_savingNoteIds` slice field is gone.
5. Grep verification: zero references to `usePromptAutoSave`, `useAgentAutoSave`, `_pendingDispatchIds`, `_savingNoteIds`, `FormStateManager`, `cacheMiddleware`.
6. All Jest tests green under jsdom (target ≥ 270 tests; 255 baseline + ≥ 15 new).
7. Net-lines report.
