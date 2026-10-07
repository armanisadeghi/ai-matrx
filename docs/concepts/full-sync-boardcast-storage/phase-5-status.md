# Phase 5 — In-progress status (autonomous session)

> Phase 5 is partially shipped. Engine extension + dead code deletion are
> done. The 6 individual feature migrations are deferred because each
> requires browser verification of UX semantics (auto-save timing, dirty
> tracking, optimistic state, echo suppression) that an autonomous agent
> cannot validate safely.

Date: 2026-04-29.
Owner: Claude (executing under Arman's "massive push without involvement"
authorization).

---

## What's shipped (commits this session)

| Commit | PR | Scope |
|---|---|---|
| `3e4ebd469` | (theme regression fix) | Fixed light/dark theme toggle on dark-prefer OS systems. Latent bug since Phase 1.E — `systemFallback` for `classToggle` was overriding the user's stored value when value !== whenEquals AND OS preferred dark. |
| `efea57701` | 5.A + 5.B | Engine extension — `autoSave` capability layered on `warm-cache`. New `AutoSaveConfig` + `AutoSaveWriteContext` types; `autoSaveScheduler.ts` (382 lines, sibling of `remoteWrite.ts`); validator extended; middleware integration; `SyncEngineApi` exposed via `_sync.engineApi()`. **+1358 lines**, all behind a feature flag (no autoSave config = no behavior change). |
| `602892367` | 5.C | Deleted dead `utils/cache/` directory entirely. 7 files, **−394 lines**. Audit confirmed zero consumers. Closes manifest #13 (form state cache) and #14 (cache middleware). |

**Tests**: 269/269 passing under jsdom (was 255 + 14 new autoSave tests).

---

## What's deferred (and why)

The 6 individual feature migrations (manifest items #8–#11) all require
**browser verification** of behaviors an autonomous agent cannot validate:

| Item | File | Why deferred |
|---|---|---|
| #8 Notes auto-save | `features/notes/redux/autoSaveMiddleware.ts` (231 lines) | Highest complexity. Two echo-suppression sets coupled with `realtimeMiddleware.ts`. First-save materialization (INSERT vs UPDATE). Auto-label generation. Custom DOM event dispatch. Migration must coordinate with realtime middleware's `isPendingEcho` switch. Browser-test required to verify users don't lose unsaved work. |
| #9 Prompts auto-save | `features/prompts/hooks/usePromptAutoSave.ts` (88 lines) | Architecturally a poor fit for the engine. Pure localStorage crash recovery read **synchronously** by `PromptBuilderErrorBoundary.getDerivedStateFromError`. Migrating to IDB primary would require async recovery — incompatible with React error boundaries. Recommendation: simplify the hook in place, do NOT migrate to the engine. |
| #10 Agents auto-save | `../aidream/apps/shared/chat/src/agents/hooks/useAgentAutoSave.ts` (85 lines) | Same pattern as #9 — localStorage shadow on top of Redux state for per-record crash recovery. Dispatches `mergePartialAgent({...,_skipDirty})` on mount. Engine doesn't model "rehydrate from LS" the same way. Recommendation: same as #9 — simplify in place. |
| #11a Code-files auto-save | `features/code-files/redux/autoSaveMiddleware.ts` (69 lines) | **Excellent fit** for the engine — per-record dirty tracking, adaptive debounce, read-only guard, dispatches `saveFileNow` thunk. Migration is mechanical: define a `codeFilesPolicy` with `autoSave.write` that calls the same thunk. Browser-test needed to verify save timing didn't change. |
| #11b Window panels | `features/window-panels/WindowPanel.tsx` (autosave block) + `WindowPersistenceManager.tsx` + `windowPersistenceService.ts` | 44 consumers via `useWindowPersistence` API. Engine-fit but API-stable swap behind the existing hook. Visibility-flush via engine's programmatic `flushAutoSave`. Must verify `onCollectData` contract still works for every window. |
| #12 Query history | `components/admin/query-history/query-storage.ts` (133 lines) | Not actually auto-save — admin-only LS append-list. Migration to engine is over-engineering for low-traffic admin tooling. Recommendation: leave as-is. |

---

## What the engine already gives the deferred migrations

The autoSave capability is fully built and tested. When ready, each
migration is now a **single policy file** away:

```ts
// Example: code-files migration sketch (deferred)
export const codeFilesPolicy = definePolicy<CodeFilesSliceState>({
  sliceName: "codeFiles",
  preset: "warm-cache",
  version: 1,
  broadcast: { actions: [...] },
  autoSave: {
    recordsKey: "files",
    triggerActions: [
      "codeFiles/setLocalContent",
      "codeFiles/setLocalName",
      "codeFiles/setLocalLanguage",
      "codeFiles/setLocalFolder",
      "codeFiles/setLocalTags",
    ],
    shouldSave: (rec) =>
      rec._dirty === true && !rec._saving && !rec.is_readonly,
    debounceMs: (rec) => getCodeAutoSaveDelay(rec.content?.length ?? 0),
    write: async ({ recordId, sliceState }) => {
      // direct Supabase update, returns the saved row
      return await CodeFilesAPI.update(recordId, sliceState.files[recordId]);
    },
    optimistic: {
      onStart: (id) => ({ type: "codeFiles/setSaving", payload: { id } }),
      onSuccess: (id, file) => ({
        type: "codeFiles/markSaved",
        payload: { id, file },
      }),
      onError: (id, error) => ({
        type: "codeFiles/setSaveError",
        payload: { id, error },
      }),
    },
  },
});
```

Then delete `features/code-files/redux/autoSaveMiddleware.ts` (69 lines)
and remove its registration from `lib/redux/store.ts` and
`lib/redux/entity-store.ts`. Browser-verify that:

1. Edit a file → wait debounce → save fires.
2. Read-only file → no save (predicate).
3. Concurrent edits to two files → two independent timers, two saves.
4. Save error → `setSaveError` action lands.
5. Tab close mid-edit → pagehide flush fires (engine handles this).

Same pattern applies to notes, panels.

---

## Open questions for resumption

1. **Prompts/agents** — should they be migrated at all? Recommendation:
   simplify in place, drop "engine migration" from manifest #9 and #10
   (decisions.md update needed).
2. **Notes echo-suppression coordination** — the `_savingNoteIds` slice
   field can only be removed after `realtimeMiddleware.ts` switches to
   `engine.engineApi().isPendingEcho("notes", id)`. Both must land in
   the same PR. Engine API is in place; the realtime switch is a
   ~5-line diff once notes' policy ships.
3. **Window panels** — internal swap with API stability is feasible,
   but the existing `WindowPersistenceManager` Context provides a
   programmatic `saveWindow(id)` that 44 consumers depend on. Decision:
   keep that API; route its implementation through
   `engine.engineApi().flushAutoSave("windowPanels", id)`.

---

## Net delta this session

| PR | Insertions | Deletions | Net |
|---|---|---|---|
| Theme fix (`3e4ebd469`) | +82 | −5 | +77 (all tests/docs) |
| Phase 5.A + 5.B (`efea57701`) | +1358 | −2 | +1356 |
| Phase 5.C (`602892367`) | 0 | −394 | −394 |
| **Session total** | **+1440** | **−401** | **+1039** |

Code-only (excluding tests): roughly **+650 lines** of new engine
infrastructure, **−400 lines** of dead code. The +650 unlocks the next
~600 LoC of legacy auto-save deletions when Arman runs the browser
verification for each migration.
