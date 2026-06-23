---
name: surface-pro-rollout
description: Wire an existing UI surface into the agent context system end-to-end — declare all generic + custom Surface Values, emit them at runtime with no unnecessary refetches, mount the canonical UnifiedAgentContextMenu on BOTH editable and presentational regions, and replace every plain `<textarea>` / `<input>` with the auto-wired `ProTextarea` / `ProInput`. Use whenever the task is "wire surface X", "add the context menu to X", "make X's inputs Pro", "roll out surface agents to X", or finishing a surface that already has a manifest/initial values. Builds on `surface-authoring` (the manifest/DB contract) — read that first. NOT for creating a brand-new surface from nothing (do `surface-authoring` first), nor for the context-menu component internals.
---

# Surface Pro rollout

Turn a surface that already exists (has a `ui_surface` row + a manifest) into a **fully agent-wired surface**: every generic and custom value mapped and emitted, the canonical right-click menu on every region a user reads or edits, and Pro inputs everywhere. When this is done for a surface, that surface is **done**.

> **Prereq:** read `.cursor/skills/surface-authoring/SKILL.md` (the manifest + `ui_surface_value` + naming contract). This skill is the consumer/runtime layer on top of it.
>
> **Reference implementation (copy its shape):** Notes.
> - Manifest: `features/surfaces/manifests/notes-editor.manifest.ts`
> - Context-data + menu props + extra sections: `features/notes/agent-context/`
> - Runtime scope hook: `features/notes/hooks/useNotesSurfaceScope.ts`
> - Live wiring example: `app/(dev)/demos/context-menu/_components/NotesDemoPanel.tsx`

---

## The platform guarantees you can rely on (do NOT re-implement)

1. **Generic baselines are always BINDABLE.** `features/surfaces/manifests/registry.ts` injects the full baseline set (`selection`, `text_before`, `text_after`, `content`, `context`) into every manifest. You never have to add them by hand — but a manifest may still declare/customize any of them, and a same-named declaration wins.
2. **Generic baselines are always EMITTED.** `launchAgentExecution` floors the scope through `withBaselineScope` (`features/surfaces/utils/baseline-scope.ts`): the 5 keys are always present at launch (empty `""` / `{}` when the surface didn't emit them). So a binding to a generic value never resolves to nothing.
3. **`buildApplicationScopeFromMenuContext`** (`features/context-menu-v2/utils/build-application-scope.ts`) already guarantees `selection` / `text_before` / `text_after` / `content` / `context` from the live DOM. Always build the menu's scope through it.

Your job is to make the surface emit **rich, real** values (not just the empty floor) and to mount the UI everywhere.

---

## Per-surface recipe

### 1. Manifest — declare the CUSTOM values (baselines are automatic)

In `features/surfaces/manifests/<slug>.manifest.ts`:

- Declare every meaningful piece of surface state as a `SurfaceValue` (honest `alwaysAvailable`, real `description` covering the empty case, sensible `sortOrder` ≥ 300). Audit the surface: what does a user see/edit here that an agent should be able to act on? Each is a value.
- Keep/keep adding baselines via `withAllBaselines(surfaceSpecific)` (from `_baseline.manifest`) OR leave the existing `mergeBaselineValues(pickBaseline(...), ...)` — the registry injects any you miss. Override a baseline only when its meaning genuinely differs here.
- Maintain the `createXxxScope({...})` helper: required keys (no `?`) = every `alwaysAvailable: true` value; everything else optional. All 5 baselines optional.

### 2. `features/<feature>/agent-context/` — the emit + menu contract

Mirror `features/notes/agent-context/`:

- **`build<Xxx>ContextData(args): Record<string, unknown>`** — a PURE function that maps live UI state → `createXxxScope(...)`. Emit real baselines from the surface: `selection`/`text_before`/`text_after` from the editor selection, `content` from the primary body, `context` from `formatEditorSurroundContext(...)` (`@/utils/format-editor-surround-context`) or a small surface blob. Plus every custom value. Pure so demo + production share one shape.
- **`<XXX>_CONTEXT_MENU_PROPS`** — `{ sourceFeature, surfaceName: "<client>/<local>", isEditable, enabledPlacements }`. `surfaceName` MUST equal `ui_surface.name`.
- **`create<Xxx>ExtraSections()`** (optional) — surface-specific non-agent menu items (Save, Export, Move…) as `ContextMenuExtraSection[]` (`features/context-menu-v2/extraSections`). See `features/notes/agent-context/notesEditorExtraSections`.

### 3. Runtime scope hook (surfaces with a live editor)

`features/<feature>/hooks/use<Xxx>SurfaceScope.ts` returning `() => SurfaceScopePayload` — reads the **live** selection from the textarea DOM ref + Redux at CALL time (not render time), then calls `buildXxxContextData`. See `useNotesSurfaceScope`. This is what prevents stale snapshots and unnecessary work.

### 4. Mount the menu on EVERY region — two variations

A surface has two kinds of region; wire both:

- **Editable region** (textarea/input/editor): wrap in `<UnifiedAgentContextMenu {...PROPS} getTextarea getApplicationScope contextData onTextReplace onTextInsertBefore onTextInsertAfter extraSections>` and put a **`ProTextarea` / `ProInput`** inside.
- **Presentational region** (rendered markdown, a transcript, a result the user reads): wrap in `<UnifiedAgentContextMenu {...PROPS} isEditable={false} getApplicationScope contextData>` — right-click offers agent actions on the displayed text; no text-replace callbacks (read-only). This is the "assist the user with information presented to them" half — do not skip it.

`getApplicationScope` is a **plain function** (NOT `useCallback`) — React Compiler memoizes it, and `useCallback` placed after a component's early `return` (e.g. `if (!record) return …`) is a rules-of-hooks violation:
```ts
const getApplicationScope = () =>
  buildApplicationScopeFromMenuContext({ selectedText, selectionRange, contextData });
```
It reads the live DOM selection at call time. Never wrap it in `useCallback`/`useMemo`.

### 5. Replace plain inputs with Pro components

- `<textarea>` → `<ProTextarea>` (`@/components/official/ProTextarea`). Pass `surfaceName` + `getApplicationScope` so the "…" menu lists the surface's bound agents (My / System / Shared / org) and runs them with full scope. Voice, copy, clean-up are free.
- `<input type=text>` → `<ProInput>` (`@/components/official/ProInput`).
- Schema-bound fields (Entity/Settings/Applet): build a thin wrapper that renders Pro — never re-implement voice/copy/submit.
- Leave Tier-1 raw shadcn `Textarea`/`BasicInput` only for true raw cases (admin diff, debug consoles).

### 6. No unnecessary refetches (hard requirement)

- `getApplicationScope` reads live values at call time; never store scope in state that re-renders.
- Bound agents load on menu OPEN only (the menu/Pro components already do this) — don't prefetch per keystroke.
- React Compiler is on: **no** manual `useMemo`/`useCallback`/`memo` — write plain functions/values (including `getApplicationScope`). Don't add effects that rebuild scope on every change. Don't forward a prop ref by mutating `.current` in a render callback (rules-of-hooks/immutability) — pass the ref straight to `ref={...}` (ProTextarea/ProInput forward it).

### 7. DB sync (main-thread / orchestrator step)

After manifest edits, the DB `ui_surface_value` must be re-synced (emit `scripts/emit-surface-sync-sql.ts` → run via Supabase MCP `execute_sql`, or `POST /api/admin/surfaces/sync-manifests`). If you are a sub-agent: DO NOT sync the DB or commit — report the exact new/changed SurfaceValues and let the orchestrator sync + commit.

### 8. Docs

Update the feature's `FEATURE.md` (entry points + a one-line Change Log entry). Surfaces with their own `FEATURE.md` for the context wiring get it there.

---

## Verify before calling a surface done

- [ ] Manifest: every custom value present + honest; `createXxxScope` signature matches; `pnpm check:surface-drift` passes.
- [ ] `buildXxxContextData` emits real baselines + customs; demo and runtime share it.
- [ ] Menu mounted on BOTH editable and presentational regions; `surfaceName` correct.
- [ ] Every `<textarea>`/`<input>` on the surface is now `ProTextarea`/`ProInput` with `surfaceName` + `getApplicationScope` on the editable ones.
- [ ] No new refetch paths; scope read live at call time.
- [ ] `tsc` clean on touched files; eslint clean.
- [ ] DB synced for the surface (orchestrator) + verified live.
- [ ] FEATURE.md updated.

## Sub-agent report shape (when delegated)

Return: (1) files changed; (2) the surface's new/changed `SurfaceValue`s (name/label/type/alwaysAvailable/typicalCharCount/sortOrder/description); (3) which regions got the menu (editable + presentational); (4) inputs swapped to Pro; (5) anything that couldn't be wired + why. Do not commit, do not sync DB.
