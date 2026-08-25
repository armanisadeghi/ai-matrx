# Runtime completion for an existing surface

Read this when a surface already has a manifest or DB row but is not fully agent-wired. The outcome is one honest runtime contract: rich live values, one canonical v3 context menu on every applicable pane, Pro inputs, real surface actions, synced DB state, and live proof.

## Hard rules

1. **One canonical menu.** Invoke `context-menu-v3`. Delete bespoke menu components and parallel data hooks; use `EditableContextMenu` / `NonEditableContextMenu` directly.
2. **The menu receives the whole surface.** Pass every meaningful live value and every real surface action. Surface actions arrive through `extraSections` bound to actual handlers; toast stubs are forbidden.
3. **Read scope at trigger time.** `getApplicationScope` reads live refs and Redux at call time. Never store a scope snapshot in state or rebuild it per keystroke.
4. **Complete both modes.** Editable and presentational regions each get the correct wrapper. A window/overlay mounts its own menu so the page underneath cannot answer its gestures.

## Runtime recipe

### 1. Reconcile the manifest

- Declare every meaningful custom value with honest `alwaysAvailable`, `autoContext`, type, description, size, group, and order.
- Keep the `createXxxScope` signature aligned: every `alwaysAvailable: true` value is required; other values and the five baselines are optional.
- Run `pnpm check:surface-impact <surface>` before changing value vocabulary.

### 2. Build one pure context contract

Mirror `features/notes/agent-context/`:

- `buildXxxContextData(args)` maps live UI state through `createXxxScope(...)`.
- `XXX_CONTEXT_MENU_PROPS` contains `sourceFeature` and the byte-identical `surfaceName`.
- `createXxxExtraSections(handlers)` exposes every real surface action with real callbacks.

Emit real baselines: editor selection and surrounding text, primary `content`, and a focused `context` object. `buildApplicationScopeFromMenuContext` guarantees the baseline floor; that fallback never replaces the surface's own rich emitter.

### 3. Add a trigger-time scope reader

For a live editor, use `useXxxSurfaceScope(): () => SurfaceScopePayload`. It reads the textarea/editor DOM ref and current global state when called, then passes them through the pure context builder. Write plain functions; React Compiler is on, so no manual `useMemo`, `useCallback`, or `memo`.

### 4. Mount the canonical menu everywhere

Invoke `context-menu-v3` and follow its full contract:

- Import wrappers statically; only their heavy content lazy-loads.
- Use `EditableContextMenu` for editors and `NonEditableContextMenu` for rendered/read-only regions.
- Use one menu per pane; lists/tables delegate row context through `resolveContextOnOpen`.
- Pass `contentSource` for real rich-document content and `entity` for attachable/shareable records.
- Pass `extraSections` for the surface's actions.
- A menu over an overlay/window belongs inside that overlay/window.
- The menu's final surface submenu must show this surface's canonical label, location, agents, related surfaces, and `v3.N · V<menuVersion>` revision. A wrong label or “This page” means identity/mapping is incomplete; bump `menuVersion` when the surface changes its custom wiring contract.

### 5. Replace plain authoring inputs

- User-authored multiline text uses `ProTextarea`; pass `surfaceName` and `getApplicationScope`.
- Agent-relevant single-line text uses `ProInput`; it gains agent access from the surrounding context menu because `ProInput` does not accept `surfaceName` or `getApplicationScope`.
- Keep raw shadcn inputs only for genuine admin/debug/code cases and document the reason beside the exception.
- Apply the text-stats length rule from `surface-check` S7; never stack duplicate metrics chrome.

### 6. Mount the provider and write handlers

- Mount `SurfaceRuntimeProvider` so header agents, menus, and other launchers share the current scope.
- Declare each agent-writeable field as a `writeTarget` and register its handler on the provider in the same change.
- A declared-but-unwired write target is worse than no declaration because it lies until apply time.

### 7. Keep loading and reads centralized

- Bound agents and unified-menu data load on menu open through the existing deduped caches; never prefetch them per keystroke or add a second query path.
- Do not add effects that rebuild scope after every state change or mutate forwarded refs during render.
- A demo and production surface share the same pure context builder so proof cannot drift from reality.

### 8. Sync and document

- Sync only the focused manifest with `npx tsx scripts/emit-surface-sync-sql.ts --surface <client>/<local>` and apply it through the sanctioned DB path.
- Verify the live `ui_surface`, value, role, and write-target rows.
- Update the feature's `FEATURE.md` and Change Log.

## Live completion gate

- Manifest and scope builder agree; `pnpm check:surface-drift`, `check:surface-routes`, and relevant impact checks pass.
- Runtime emits real baselines and every custom value; Surface Context Admin has no missing Always values.
- Canonical v3 menu opens on editable and presentational panes, uses the correct surface label, and shows no `INERT MENU` or `VALUE MAPPING GAP` diagnostics.
- No-selection Copy and Download as Markdown act on whole content; selected text acts on the selection.
- Every real surface action is reachable through `extraSections`; `contentSource` and `entity` unlock the applicable shared actions.
- Pro inputs replace ordinary authored-text inputs or carry an explicit justified exception.
- Scope reads live without refetch or render loops.
- DB mirror is synced, live behavior is verified, and docs are current.

## Delegated implementation report

When an authorized coordinator delegates part of this rollout, the implementer returns: files changed; every new/changed SurfaceValue with its full contract; editable and presentational regions wired; inputs migrated to Pro; and anything not completed with the exact reason. The coordinator owns DB sync, certification, commit, and handoff unless the delegation explicitly says otherwise.
