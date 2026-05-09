# COMPOSITE_ROADMAP.md — `agent-apps` composition

**Status:** `design — not yet implemented`
**Owner:** _unassigned_
**Prerequisites:** Phase 1d (single-app polish) lands first
**Related plan:** `~/.claude/plans/we-are-going-to-synchronous-ritchie.md` Phase 7 (Embedded shortcuts)
**Last updated:** `2026-05-09`

---

## Why this doc exists

`features/agents/redux/agent-apps/thunks.ts:248-262` ships `addEmbeddedShortcut` / `removeEmbeddedShortcut` that throw `COMPOSITION_NOT_IMPLEMENTED`. The DB has the upstream plumbing — `aga_apps.app_kind` (`'single' | 'composite'`, default `'single'`) and `aga_apps.shared_context_slots jsonb` — but no embedding table, no UI, no runtime hook. Today every row is `kind='single'` and the column is unused.

This is the design doc for the missing pieces. Implementation is deliberately deferred until Phase 1d (single-app CRUD polish) is signed off.

---

## Two flavors of composition — keep them separate

The codebase already carries one composition design that is NOT what this doc is about, and conflating them is the easiest way to ship the wrong thing. Names matter here.

### Flavor A — **Embedded shortcuts** (this doc)

An app row whose `component_code` includes one or more first-class invocation handles to **agent shortcuts**. Same shape as the rest of the product: a Shortcut is a stored, version-pinned wrapper around an agent invocation with `scopeMappings` from UI-context keys → agent-variable names. The hosting app exposes its current state as the UI context; clicking an embedded shortcut launches that shortcut's agent with the app's state pre-bound. Same infrastructure as the code-editor, Notes, and the agent-builder shortcut menus — applied inside an agent-app's render surface.

This is what `addEmbeddedShortcut` was always meant to be. It's also what [`features/agent-apps/FEATURE.md`](FEATURE.md) §Composition describes (the Flashcard/Tutor/Quiz example).

### Flavor B — **Parent-app-with-children-apps** (Phase 10, applets capture)

A different shape entirely: a container `agent_app` row that owns an ordered list of *other* `agent_app` rows as children, with one shared `conversationId` flowing across siblings as the user navigates between them. Designed in [`features/agents/migration/phases/phase-10-applets-capture.md`](../agents/migration/phases/phase-10-applets-capture.md) as the agent-native replacement for legacy `features/applet/`'s `CustomAppConfig` → `CustomAppletConfig` topology. Linkage table `agent_app_children`. Decision recorded in [`DECISIONS.md` 2026-04-21](../agents/migration/DECISIONS.md).

Different table, different runtime contract, different UI.

### Reconciliation: what does `app_kind = 'composite'` mean?

The Phase 10 doc reserves `app_kind = 'composite'` for **Flavor B**. To avoid conflicting semantics on a single column:

- **Embedded shortcuts (Flavor A) do NOT flip `app_kind`.** Any app — `single` or `composite` — can attach shortcuts. `app_kind` describes the *render topology* (leaf code component vs child-switcher container); shortcut attachment is additive metadata that doesn't change the render path.
- **`shared_context_slots` is shared across both flavors.** A composite parent declares it (Flavor B); an app with embedded shortcuts may also declare it for the embedded shortcuts to read. The column stays single-purpose: "the shared working memory contract for whatever this app embeds."

If we ever ship Flavor B before Flavor A, an existing single-app row that gains an embedded shortcut stays `kind='single'`. That's intentional.

> **Open question for the user:** is this reconciliation correct, or do you want `app_kind = 'composite'` to mean "has at least one embedded shortcut" (overriding the Phase 10 framing)? Default below is the reconciliation; flag this in review.

---

## DB shape

### Option 1 — `aga_apps.embedded_shortcut_ids jsonb DEFAULT '[]'`

A single ordered array of shortcut UUIDs on the row. No new table.

**Pros:**
- Zero schema work beyond an `ALTER TABLE`.
- Trivially `kind='single'`-compatible — the column is empty array on every existing row, no migration step needed.
- Reads are one-row queries; the renderer already has the row in hand.
- Order is implicit in the array.

**Cons:**
- No per-link metadata. Every Phase-10 lesson about `agent_app_children` (slug, label, `required_slots`, `writes_slots`) said "a self-FK couldn't carry per-link state." Same problem here: when we want a per-shortcut placement label ("Run as primary CTA" vs "Show in shortcut tray") or a per-link variable-mapping override, we'd be stuffing it into a parallel JSON column or migrating to a join table later.
- Orphan handling on shortcut delete is awkward — array entries become silent dangles unless we add a trigger or post-process the JSON.
- Can't query "every app that embeds shortcut X" without a sequential scan + JSON `?` operator on every row.
- Can't enforce shortcut-id existence at the DB level (no FK on a JSONB array).
- Does not match the existing Phase 10 precedent (`agent_app_children`), so the codebase ends up with two different patterns for two flavors of composition.

### Option 2 — `aga_app_shortcuts` junction table

```sql
CREATE TABLE public.aga_app_shortcuts (
  app_id        uuid NOT NULL REFERENCES public.aga_apps(id) ON DELETE CASCADE,
  shortcut_id   uuid NOT NULL REFERENCES public.agx_shortcut(id) ON DELETE RESTRICT,
  sort_order    integer NOT NULL DEFAULT 0,
  label         text,                           -- optional per-link override
  variable_overrides jsonb DEFAULT '{}'::jsonb, -- per-link scopeMappings overrides
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, shortcut_id)
);
CREATE INDEX aga_app_shortcuts_app_id_sort ON public.aga_app_shortcuts(app_id, sort_order);
CREATE INDEX aga_app_shortcuts_shortcut_id ON public.aga_app_shortcuts(shortcut_id);
```

**Pros:**
- Exact mirror of the Phase 10 `agent_app_children` decision. One pattern for both flavors of composition; future agents reading the codebase don't have to learn two stories.
- DB-level FK integrity — a shortcut delete either cascades the link via `ON DELETE CASCADE` (if we choose) or is blocked by `ON DELETE RESTRICT` (recommended; matches the precedent of preventing accidental shortcut destruction).
- Per-link metadata grows cleanly. `variable_overrides` lets a single Tutor shortcut be embedded twice in the same app under different variable mappings without forking the shortcut.
- "Apps embedding shortcut X" is a one-line indexed query — useful for "deleting this shortcut will break N apps" warnings on the shortcut CRUD surface.
- RLS scopes cleanly: a join via `aga_apps.user_id` / `organization_id` (or, for shortcuts, via the shortcut's own scope) handles read/write authorization the same way as every other linked entity in the app.

**Cons:**
- One more table. One more set of types and CRUD endpoints.
- Junction reads cost an extra query on every app load (mitigated by including the join in `AgentAppHydratorServer`).

### Decision: Option 2 (junction table `aga_app_shortcuts`)

Per-link metadata is real (we already know we'll want at least `sort_order` and a per-link variable override), DB-level integrity matters because shortcuts are mutable resources users delete frequently, and matching the Phase 10 precedent is worth more than one table's worth of boilerplate. The "extra query on app load" cost is recovered by the existing hydrator pattern.

This decision should be logged in `DECISIONS.md` when implementation lands.

---

## Variable inheritance — auto vs explicit

### Today's contract (background)

A shortcut already carries `scopeMappings: Record<string, string>` — UI-context-key → agent-variable-name. The hosting surface (code editor, Notes, etc.) exposes a UI context object with universal keys (`selection`, `content`, `context`, …) plus surface-specific ones, and `createInstanceFromShortcut({ shortcutId, uiScopes })` resolves variables from that context. The shortcut is self-contained; the host just provides the context bag.

That contract doesn't change. The question is what counts as the "UI context" when the host is an agent app, and what happens when a shortcut variable has no explicit mapping.

### Option A — Strict explicit mapping

Every shortcut variable MUST have a matching entry in `scopeMappings`. If not, the shortcut errors on launch.

**Pros:** Predictable — what you see in the shortcut config is what runs. Renames on either side are immediately visible as breakage.
**Cons:** Hostile UX. The common case (app variable `draft_text` ↔ shortcut variable `draft_text`) requires manual mapping every time. Ergonomically the same problem `scopeMappings` was designed to solve for surfaces, just at a different layer.

### Option B — Auto-inherit by name match (default), with explicit override

The app's UI context object passed to `createInstanceFromShortcut` is composed from:

1. **Universal UI-context keys** the app surface itself synthesizes (`selection` → empty / `content` → main artifact / `context` → app description) — same set as every other surface.
2. **The app's resolved variable values** — every variable in the app's `variable_schema` is exposed by name on the context bag. So an app variable `draft_text` becomes `uiContext.draft_text` automatically.
3. **The app's declared `shared_context_slots`** values — same trick, by slot key.

Then the shortcut's `scopeMappings` override-and-fall-back works as today: if the shortcut explicitly maps `agent_var: 'app_var_name'`, that wins; if it doesn't, the runtime auto-binds by name match against the context bag.

The per-link `variable_overrides` column on `aga_app_shortcuts` is the third tier — it lets a specific embedding tweak the mapping without forking the underlying shortcut.

**Resolution order (highest priority first):**

1. `aga_app_shortcuts.variable_overrides[var_name]` — per-link override
2. `shortcut.scopeMappings[var_name]` — shortcut-level explicit mapping
3. Name match against the app's UI context bag — implicit
4. Variable's own default value
5. Required → error; optional → undefined

**Pros:** Common case "just works." Power case (rename a variable, override a binding) has a clean override surface. Mirrors how `scopeMappings` already behaves for other surfaces — same mental model.
**Cons:** Implicit behavior can mask renames. Mitigation: a publish-time validator in the embedded-shortcuts editor warns when a shortcut variable isn't mapped explicitly AND has no name match against the parent app's variables — soft warn, not a blocker.

### Decision: Option B (auto-inherit by name match, with explicit override)

Matches the existing shortcut contract for other surfaces, keeps the common case ergonomic, and the per-link `variable_overrides` column gives us the escape hatch when name-match isn't enough. The publish-time validator catches drift without blocking authoring.

---

## UI — `/agent-apps/[id]/settings` "Embedded Shortcuts" section

### Layout

A new card on the Settings page, sitting between the existing "Agent binding" and "Scope" cards.

```
┌─ Embedded Shortcuts ──────────────────────────────────────────┐
│  Shortcuts that ship with this app. Users can invoke them     │
│  directly from the running app — variables auto-bind from     │
│  the app's current state.                                     │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ ⠿  ✦ Tutor — "I'm Confused"           ⓘ  ⚙  🗑     │    │
│  │ ⠿  ⚡ Quiz Maker — "Make Me a Quiz"    ⓘ  ⚙  🗑     │    │
│  │ ⠿  📋 Flashcards — "More Like This"   ⓘ  ⚙  🗑     │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  [+ Attach shortcut]                                          │
│                                                               │
│  ⚠ 1 shortcut variable has no name match (`tutor_topic`).    │
│  Add an explicit mapping or rename a variable.                │
└───────────────────────────────────────────────────────────────┘
```

### Components to build

- **`features/agent-apps/components/crud/EmbeddedShortcutsEditor.tsx`** — the card itself. List of attached shortcuts, drag-handle reorder (`@dnd-kit`), per-row info popover (shortcut details), settings popover (per-link `variable_overrides` + label override), delete with `confirm()` from `ConfirmDialogHost`.
- **`features/agent-apps/components/crud/AttachShortcutDialog.tsx`** — dialog (drawer on mobile) with searchable picker over `agx_shortcut` rows scoped to the same scope as the app (user's own + org + system). Reuses the existing `ShortcutPicker` from `features/agent-shortcuts/components/` if one exists, otherwise builds on `SearchableAgentSelect`'s pattern.
- **`features/agent-apps/components/crud/EmbeddedShortcutMappingPopover.tsx`** — per-link override editor. Two-column table: shortcut variable name (left) → app variable / context bag key (right, dropdown of the app's `variable_schema` + universal keys). Empty selection = "auto by name match (fall back to default)."
- **A publish-time validator** in `features/agent-apps/utils/validateEmbedded.ts` — pure function, takes `{ app, shortcuts }` and returns `{ warnings: string[]; errors: string[] }`. Drives the orange banner.

### Thunks to un-stub + add

In `features/agents/redux/agent-apps/thunks.ts`:

- `addEmbeddedShortcut({ appId, shortcutId, sortOrder?, label?, variableOverrides? })` — `INSERT INTO aga_app_shortcuts ...`, then dispatch a slice action that pushes the link onto `state.agentApp.apps[appId].embeddedShortcuts`.
- `removeEmbeddedShortcut({ appId, shortcutId })` — `DELETE FROM aga_app_shortcuts WHERE app_id = ? AND shortcut_id = ?`, dispatch a slice action that filters the array.
- `reorderEmbeddedShortcuts({ appId, shortcutIds })` — bulk `UPDATE` of `sort_order` in a single transaction.
- `updateEmbeddedShortcut({ appId, shortcutId, label?, variableOverrides? })` — per-link metadata update.
- `fetchEmbeddedShortcutsForApp(appId)` — explicit fetcher; the hydrator can do this server-side instead.

### Slice changes

`features/agents/redux/agent-apps/slice.ts` — add an `embeddedShortcuts: EmbeddedShortcutLink[]` field to the per-app record:

```ts
interface EmbeddedShortcutLink {
  shortcutId: string;
  sortOrder: number;
  label: string | null;
  variableOverrides: Record<string, string>;
  createdAt: string;
}
```

The shortcut record itself stays where it lives today (the `agentShortcut` slice). The link record is the join row.

### Hydrator integration

`features/agent-apps/route/AgentAppHydratorServer.tsx` already fetches the app + bound agent in one server load. Extend it to also fetch:

- The `aga_app_shortcuts` rows for this app.
- The `agx_shortcut` rows referenced by those links (so the shortcut menu has full data without a follow-up roundtrip).

Three queries instead of two; both extras are indexed lookups.

---

## Renderer — `useEmbeddedShortcuts()` hook

### Where it lives

`features/agent-apps/hooks/useEmbeddedShortcuts.ts` — a client hook exposed to the app's sandboxed `component_code`. The Babel-transformed component imports it from the renderer's `allowedImports` allowlist.

### What it returns

```ts
type EmbeddedShortcut = {
  id: string;                    // shortcut id (stable across reorders)
  label: string;                 // per-link label override OR shortcut.label
  iconName: string | null;
  description: string | null;
  sortOrder: number;
  /**
   * Fire the shortcut. The hook builds the UI context bag from:
   *   1. the app's universal-keys layer (selection/content/context),
   *   2. the app's resolved variable values (by `variable_schema` name),
   *   3. the app's `shared_context_slots` values,
   * then dispatches `createInstanceFromShortcut` with that bag.
   * `extraContext` is shallow-merged on top of the auto-built bag for
   * use cases like "this card's row data."
   */
  invoke: (extraContext?: Record<string, unknown>) => Promise<string>; // returns conversationId
};

function useEmbeddedShortcuts(): EmbeddedShortcut[];
```

### How it composes with the app's existing state

The hook reads:

- The current app's `variable_schema` and resolved variable values (already in scope via the app's runtime — typically a `useAgentAppRuntime()` hook from the renderer infrastructure).
- The app's `shared_context_slots` declared values (Phase 6 surface; if not present, treated as empty).
- The list of `EmbeddedShortcutLink`s + their referenced shortcut records from the slice.

When `invoke()` is called, it builds the UI context bag per the resolution order in §"Variable inheritance" and dispatches `createInstanceFromShortcut` with the per-link `variableOverrides` merged in as a top-level override layer on the shortcut's own `scopeMappings`.

### Default rendering — opt-in only

The hook is a primitive. A template that wants to render shortcut buttons can do so however it likes:

```tsx
const shortcuts = useEmbeddedShortcuts();

return (
  <div className="flex gap-2">
    {shortcuts.map((s) => (
      <Button key={s.id} onClick={() => s.invoke()}>
        {s.label}
      </Button>
    ))}
  </div>
);
```

Apps that don't call the hook get no shortcut UI. This is the right default — the renderer never injects UI the app's `component_code` didn't ask for.

### "Open in window-panel" affordance

When a shortcut launches from inside an app, the resulting conversation should appear in a window panel (per Phase 1d's "stay on the app page" rule) rather than route-navigating away. `createInstanceFromShortcut` already supports a `displayMode` argument; the hook defaults to `displayMode: 'flexible-panel'` for embedded invocations and lets the caller override.

---

## Migration

### Why "zero impact" is real

Today every `aga_apps` row has `app_kind = 'single'` and `shared_context_slots = '[]'::jsonb`. There are no `aga_app_shortcuts` rows because the table doesn't exist. Migration adds:

1. `CREATE TABLE aga_app_shortcuts` — empty.
2. Renaming/adding nothing on `aga_apps` — `app_kind` and `shared_context_slots` already exist (no-op).
3. Adding the embedded-shortcuts hydrator query alongside the existing app-load query — extra `SELECT` returns 0 rows on every existing app.

Existing app pages render identically. The new Settings card shows "No embedded shortcuts." The renderer's `useEmbeddedShortcuts()` returns `[]` for every existing app. Public URLs (`/p/[slug]`) are unchanged.

### RLS

`aga_app_shortcuts` rows authorize via the parent `aga_apps.id`:

```sql
ALTER TABLE public.aga_app_shortcuts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aga_app_shortcuts_select" ON public.aga_app_shortcuts
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.aga_apps a
      WHERE a.id = aga_app_shortcuts.app_id
        AND (
          a.is_public = true
          OR a.user_id = (select auth.uid())
          OR a.organization_id IN (select org_id from public.user_organizations where user_id = auth.uid())
          -- + admin path via is_super_admin() if applicable
        )
    )
  );

CREATE POLICY "aga_app_shortcuts_write" ON public.aga_app_shortcuts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.aga_apps a
      WHERE a.id = aga_app_shortcuts.app_id AND a.user_id = (select auth.uid())
    )
  );
```

(The actual policies should mirror whatever `aga_apps` already does — this is a sketch.)

### Public URL exposure

The existing `get_aga_public_data` RPC needs to extend its return to include the embedded shortcut links + their referenced shortcut records. Same pattern as the Phase 8 expansion that added `agent_id`, `agent_version_id`, `use_latest`. No new RPCs.

### Rollback

The whole feature is additive. Rollback = `DROP TABLE aga_app_shortcuts CASCADE` + revert the slice + revert the hydrator. Existing app pages keep rendering.

---

## Phases

### Phase A — DB + types (1 day)

- Migration: `migrations/create_aga_app_shortcuts.sql` per §DB shape.
- Regenerate `types/database.types.ts`.
- Add `EmbeddedShortcutLink` type to `features/agent-apps/types.ts` and the slice's app record type.
- Extend `get_aga_public_data` RPC to return the embedded links.
- No UI yet. Verify the table is empty + RLS blocks unauthorized reads.

**Verify:** SQL only — `INSERT` a test row, `SELECT` from a peer-user session and confirm RLS blocks it.

### Phase B — Thunks + slice (1 day)

- Implement `addEmbeddedShortcut`, `removeEmbeddedShortcut`, `reorderEmbeddedShortcuts`, `updateEmbeddedShortcut`, `fetchEmbeddedShortcutsForApp` in `features/agents/redux/agent-apps/thunks.ts` (replacing the `COMPOSITION_NOT_IMPLEMENTED` stubs).
- Add slice reducers for the new shape.
- Extend `AgentAppHydratorServer` to fetch and seed the link rows + referenced shortcut records.

**Verify:** unit-level — dispatch the thunks against a test app, assert the slice + DB stay in sync.

### Phase C — Settings card UI (2 days)

- `EmbeddedShortcutsEditor.tsx`, `AttachShortcutDialog.tsx`, `EmbeddedShortcutMappingPopover.tsx` per §UI.
- Mount on `/agent-apps/[id]/settings` between Agent binding and Scope.
- Mobile: drawer for the picker, full-width list rows.
- Hook up the publish-time validator + warning banner.

**Verify:** attach two shortcuts to a real app, reorder, edit a per-link override, delete one. Reload the page — state persists. Validator warns when expected.

### Phase D — `useEmbeddedShortcuts()` + renderer wiring (2 days)

- Build the hook in `features/agent-apps/hooks/useEmbeddedShortcuts.ts`.
- Add it to the renderer's allowlisted imports in [`features/agent-apps/components/AgentAppPublicRendererImpl.tsx`](components/AgentAppPublicRendererImpl.tsx).
- Update the AI app-builder system prompt + a sample template to demonstrate the pattern.
- Confirm a shortcut launched from inside an app opens in a window panel (Phase 1d behavior) — not as a route navigation.

**Verify:** seed a test app whose `component_code` calls `useEmbeddedShortcuts()`, attach a shortcut, run the app at `/p/<slug>`, click the shortcut — agent launches with the app's variables auto-bound, conversation opens in a window panel, app stays mounted.

### Phase E — Polish (1 day)

- Per-link `variable_overrides` editor finishes on the slice + popover side.
- "Apps using this shortcut" surface on the shortcut CRUD page (one query against `aga_app_shortcuts` by `shortcut_id`) so deleting a shortcut shows a "this will break N apps" warning.
- Public URL exposure verified (`get_aga_public_data` returns embedded shortcuts; the public renderer wires them through).

**Verify:** delete a shortcut that's embedded in an app — gets blocked by `ON DELETE RESTRICT` with a useful error. Detach it from the app first — delete proceeds. Public URL renders the shortcut UI correctly.

---

## Out of scope for this roadmap

- **Flavor B (parent-app-with-children-apps).** Designed in [`phase-10-applets-capture.md`](../agents/migration/phases/phase-10-applets-capture.md); separate roadmap.
- **Cross-app shortcut composition** beyond what the existing shortcut model already supports. A shortcut embedded in app X can already invoke an agent that itself drives app Y (per [`FEATURE.md`](FEATURE.md) §Composition). No new wiring needed.
- **Authoring shortcuts inline from the app editor.** Use the existing shortcuts CRUD at `/agents/shortcuts/`, then attach. Rebuilding shortcut authoring inside the app editor is a UX trap.
- **`displayMode` per-embedded-shortcut overrides.** The shortcut's own `displayMode` wins. If we need per-app overrides later, add a `display_mode_override` column to `aga_app_shortcuts`.
- **Workflow-backed shortcuts.** Shortcuts can target workflows instead of single agents (per [`agent-shortcuts/FEATURE.md`](../agent-shortcuts/FEATURE.md)). Out of scope until workflows are unbroken.

---

## Open questions

1. **`app_kind` semantics.** Is the reconciliation in §"Two flavors" right (embedded-shortcuts don't flip `app_kind`), or should attaching the first shortcut flip it to `'composite'`? The case for flipping: simpler render-path branching ("composite apps render the shortcut tray by default"). The case against: collides with the Phase 10 framing where `composite` means a child-switcher container. **Recommendation: don't flip; keep `app_kind` purely about render topology.**
2. **Default UI when the template doesn't call `useEmbeddedShortcuts()`.** Should the renderer ALWAYS render a fallback shortcut tray (e.g. a floating button cluster) for any app with attached shortcuts, even if the template ignores them? **Recommendation: no — silent until the template asks. An attached-shortcut-not-rendered case is a soft warning in the editor, not a runtime injection.**
3. **Public-app shortcut access.** A public app's embedded shortcut may itself be a public/private/org shortcut. Does invoking an embedded shortcut from a public-app session inherit the app's public-execution path (guest-allowed, rate-limited), or does the shortcut's own scope override? **Recommendation: app's path wins for the invocation context (public app → guest-allowed launch); the shortcut's scope determines visibility (a private shortcut shouldn't be embeddable in a public app — block at attach time).**
4. **Conversation lifecycle.** When the user invokes an embedded shortcut, does the shortcut's conversation get its own `conversationId`, or share the app's `conversationId` if one exists? Phase 10's composite-with-children rule is "share." For embedded shortcuts the answer is less obvious. **Recommendation: separate `conversationId` per shortcut launch — apps and their embedded shortcuts are loosely coupled by design (the example flow has a Tutor agent and a Quiz agent that shouldn't see each other's working memory). If shared memory is needed, use `shared_context_slots` instead.**
5. **Per-link `variable_overrides` JSON shape.** Above sketch is `Record<agentVarName, appKey>`. Should it instead be the same shape as `scopeMappings` for symmetry? **Recommendation: yes — match `scopeMappings` exactly. One mental model, not two.**

---

## Change log

| Date | Who | Change |
|---|---|---|
| 2026-05-09 | claude | Initial roadmap. Picked `aga_app_shortcuts` junction table over array column, auto-inherit-by-name with explicit override for variable inheritance, separate `conversationId` per shortcut launch. Reconciled `app_kind` semantics against the Phase 10 design — kept the column reserved for parent-with-children topology; embedded shortcuts are additive metadata that doesn't flip `app_kind`. No code changes; implementation deferred until Phase 1d single-app polish lands. |
