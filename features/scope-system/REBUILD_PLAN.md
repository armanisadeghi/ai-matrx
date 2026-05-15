# Scope System Rebuild — Plan

> Working doc, not a `FEATURE.md`. Drives the rewrite that replaces the seven
> overlapping slices, three services, and ad-hoc direct queries under
> `features/agent-context/redux/scope/`, `features/scope-system/redux/`, etc.
> Once the new system ships and the old code is gone, the surviving canonical
> doc lives in `features/scopes/FEATURE.md` (final home TBD — see §10).

---

## 1. Problem (one paragraph)

Scope data is owned by no one and touched by everyone. Today: `hierarchySlice`
caches a giant blob from `get_user_full_context`; `scopesSlice` /
`scopeTypesSlice` / `scopeAssignmentsSlice` / `scopeContextSlice` each own a
shard via EntityAdapter; `features/scope-system/redux/` adds three more
parallel slices; `contextService.ts` queries `ctx_scopes` directly with no
RPC; modals like `AddScopeModal` re-query `ctx_scope_types` independently;
notes reach into `ctx_scope_assignments` from its own thunks; React Query
hooks live alongside Redux thunks for the same data. Worst, several
"selection" components mutate global app context as a side effect of being
opened — so picking a scope to assign to an agent silently changes the
user's working context.

The fix is a single canonical tree, a small set of cache-aware thunks, and
two clearly-separated UI surfaces: one that **owns** the global active
context, and one that **never touches** it.

---

## 2. Canonical data model (recap)

```
auth.users
└── organizations           (org, FK)
    ├── scope_types         (categories the org defines)
    │   └── scopes          (items in that category — M2M to most things)
    │       └── scopes      (optional nesting via parent_scope_id)
    └── projects            (project, FK)
        └── tasks           (task, FK, self-nesting)
```

Plus, orthogonally:

- `ctx_context_items` — fields defined on a scope_type (the spreadsheet columns).
- `ctx_context_item_values` — actual cell values for a scope.
- `ctx_scope_assignments` — M2M link from a scope to any entity (agent, project, note, etc.).

**Invariants worth pinning:**

1. **Scope types are not assignable.** Only individual scopes are. The
   selector UIs must reflect this — types are headers, not pickable leaves.
2. **Org / project / task are FK relationships → one-of.** Setting them on
   an entity is `UPDATE entity SET project_id = …`, not an assignment row.
3. **Scopes are M2M.** Setting them on an entity is `INSERT/DELETE
   ctx_scope_assignments`. One entity can have many scopes; one scope can
   be on many entities.
4. **`max_assignments_per_entity` on a scope_type** narrows the M2M to
   "at most N scopes of this type per entity." Honored by the picker, not
   the data model.
5. **A scope lives in exactly one org.** Activating a scope from Org A
   implies Org A is the active org.

---

## 3. The two surfaces (don't conflate these)

### Surface A — **Active Context Selector**
> "What am I working on right now?"

- **Owns** the global `appContext` (org_id / scope_selections / project_id /
  task_id / conversation_id).
- Shows the full tree: orgs → scope_types → scopes → projects (and tasks
  under the active project, lazy-loaded).
- Selecting any leaf **cascades activation up the tree.** Selecting
  scope `Ava` activates `Personal Org → Kids type → Ava`. Selecting
  project `Science` on top of that yields the full path
  `Personal Org → Kids → Ava → Science`. Nothing is *excluded* — context
  is additive up the spine.
- One selection per axis at a time (one org, one project, one task, one
  conversation). Multiple scope axes are allowed because a user can be
  filtered by both `Kid: Ava` and `Subject: Science` simultaneously
  (different scope_types, both active).
- Selecting a level fires a background, fire-and-forget task fetch for that
  level (cache-aware, deduped). The selector doesn't block on it.

### Surface B — **Assignment Picker**
> "Pick a target for this thing I'm holding."

- **NEVER** mutates `appContext`. Period. This is the #1 bug being killed.
- Caller hands it a config: what kinds of targets are allowed (scope,
  project, org, task, any subset), and what the M2M cap is.
- Internally renders the tree the same way Surface A does, but selections
  produce a **return value**, not a state change.
- Two return modes by target kind:
  - **Scopes (M2M):** picker owns add/remove/list. On confirm, returns the
    final list of scope ids. Optionally writes through to
    `ctx_scope_assignments` itself given an `entity_type` + `entity_id`
    ("managed mode"). If no entity given, returns the list and lets the
    caller persist.
  - **Org / project / task (FK):** picker returns `{ kind, id }`. Caller
    decides what to write (an `UPDATE` on its own table).

If a single component handling both modes turns out clumsy, split into
`ScopeAssignmentPicker` (M2M) and `EntityTargetPicker` (FK) sharing one
tree-rendering primitive.

---

## 4. Redux shape (proposed)

One feature folder, one slice for tree data, plus the existing
`appContextSlice` (which already has the right shape; we keep and clean it).

### `scopesSlice` (new — replaces all seven existing scope-related slices)

```ts
interface ScopesState {
  // Canonical tree, keyed by org_id for easy patching.
  organizations: Record<string, OrgNode>;
  organizationIds: string[];          // stable order: personal first, then alpha

  // Fetch lifecycle for the root tree.
  treeStatus: 'idle' | 'loading' | 'ready' | 'error';
  treeError: string | null;
  treeFetchedAt: number | null;       // for cache-validity checks

  // Per-level task caches. Keys: `org:<id>`, `scope:<id>`, `project:<id>`.
  tasksByKey: Record<string, TaskListEntry>;
}

interface OrgNode {
  id; name; slug; is_personal; role;
  scope_types: ScopeTypeNode[];       // each with nested scopes[]
  projects: ProjectNode[];            // present only after _with_projects fetch
}

interface TaskListEntry {
  status: 'loading' | 'ready' | 'error';
  fetchedAt: number | null;
  taskIds: string[];                  // tasks themselves stored normalized? TBD §9
}
```

**Why one tree, not normalized adapters:** the RPC returns it nested. Most
consumers want it nested (sidebars, pickers). Normalizing inflates code with
no payoff; the tree is small (orgs × types × scopes ≪ 1000 rows for any
realistic user). If a heavy normalized view becomes necessary later,
derive it with a memoized selector — don't store it twice.

### `appContextSlice` (keep, light cleanup)

Already has `organization_id`, `scope_selections: Record<typeId, scopeId>`,
`project_id`, `task_id`, `conversation_id`. Keep the cascade-reset
behavior on upstream changes. Add a derived selector for "active path"
(the cascaded set of ids — see §6).

### Delete (after migration — see §10)

- `features/agent-context/redux/scope/` (all four slices)
- `features/agent-context/redux/hierarchySlice.ts` + `hierarchyThunks.ts`
- `features/scope-system/redux/scopeValuesSlice.ts` *(unless still needed
  for context-item values — see §8)*
- `features/scope-system/redux/contextItemsSlice.ts` *(same caveat)*

---

## 5. Thunks (the smart automation layer)

All thunks share one rule: **never refetch if state already has the data,
unless the caller passes `{ refetch: true }`.** A thunk that fires twice in
the same render or because of a route change is a bug, not a feature.

```ts
// Root tree. Fired once at app boot (auth ready), and only refetched on
// explicit refresh.
ensureScopeTree({ refetch?: boolean })

// Tasks for a given level. Fired by Surface A on selection, fire-and-forget.
// Keys cache by `{level}:{id}`. Already-loading? Returns the in-flight
// promise instead of starting a second one.
ensureTasksForLevel({ level: 'org' | 'scope' | 'project', id: string, refetch?: boolean })

// Single-write mutations — they update the tree in place and invalidate
// only the affected slice of state, no full refetch.
createScope({ org_id, scope_type_id, name, parent_scope_id? })
updateScope({ scope_id, patch })
deleteScope({ scope_id })

createScopeType({ org_id, ... })
updateScopeType({ scope_type_id, patch })
deleteScopeType({ scope_type_id })

// M2M assignment writes (used by Surface B in managed mode).
setEntityScopes({ entity_type, entity_id, scope_ids })
```

**Cache key for `ensureScopeTree`:** the current user id. If user logs out
and back in (or impersonates), the slice resets. The thunk should also
include a soft TTL (e.g. 5 min) for explicit `refetch: false` callers if
the tree might be stale — but the primary correctness mechanism is the
explicit invalidation on mutations, not TTL.

**RPC choice for the root fetch:** `get_user_scopes_with_projects`. Surface
A needs projects in the tree to render the project sub-list; orphan tasks
hang off the selected project via `ensureTasksForLevel`. Tasks are too
chatty to bundle into the root fetch.

---

## 6. "Active path" — the derived selector

The whole "select Ava + Science → activate Personal Org, Kids, Ava, Science"
behavior is **not stored**; it's derived from the leaf selections plus the
tree.

```ts
// selectors/activePath.ts
selectActivePath = createSelector(
  [selectAppContext, selectScopeTree],
  (ctx, tree) => {
    // Walk: org_id → scope_selections → project_id → task_id
    // Resolve each id to its node, return:
    return {
      organization: OrgNode | null,
      scopeTypes:   ScopeTypeNode[],   // every type with an active scope
      scopes:       ScopeNode[],       // every actively selected scope
      project:      ProjectNode | null,
      task:         TaskNode | null,
      // Convenience: flattened id set for "is X active?" checks.
      activeIds: Set<string>,
    };
  }
);
```

Consumers (agents, prompt builders, sidebars highlighting active items)
read this — not raw `appContext`. That way every consumer sees the full
cascaded context automatically.

---

## 7. Components (Surface A vs Surface B)

### Surface A — owns global context
- `<ActiveContextSelector />` — primary tree picker (sidebar / nav).
  Reads `selectScopeTree`, writes via `setOrganization`,
  `setScopeSelections`, `setProject`, `setTask` actions on
  `appContextSlice`. Fires `ensureTasksForLevel` on selection.
- `<ActiveContextBreadcrumb />` — read-only display of `selectActivePath`.
- `<ActiveScopeChip kind="org|scope|project|task" />` — small pills used
  in headers / chat composer.

### Surface B — never touches global context
- `<ScopeAssignmentPicker entityType entityId? scopeTypeFilter? mode />`
  - `mode="managed"`: writes through to `ctx_scope_assignments` on
    confirm via `setEntityScopes` thunk.
  - `mode="controlled"`: emits `(scopeIds) => void` and lets caller
    persist.
- `<EntityTargetPicker allow={['org'|'project'|'task'|'scope']} onSelect />`
  — returns `{ kind, id }`. Always controlled; no internal writes.
- (Optional) `<ScopeTreeView />` — the shared rendering primitive both
  surfaces use; pure presentation, no Redux writes.

Both pickers render from the same `selectScopeTree` data. Neither
re-fetches; they trust `ensureScopeTree` has already run at boot.

---

## 8. What's explicitly out of scope (for *this* rewrite)

These are real, related, and broken — but we draw a line so this rewrite
ships:

1. **Context Items + Values** (the "spreadsheet columns and cells"). The
   `contextItemsSlice` and `scopeValuesSlice` and the `useScopeAutoSave`
   hook touch these. They can keep working off their own RPCs
   (`list_scope_type_items`, `get_scope_context`, etc.) for now. They'll
   get a Phase 2 pass once the tree/active-context layer is solid.
2. **Direct `.from('ctx_scope_assignments')` callers** (notes thunks etc.)
   — left in place; replaced opportunistically when the new
   `setEntityScopes` thunk is in.
3. **`contextService.ts` direct queries** — left until Phase 2 collapses
   them into RPCs.
4. **Wiring agents / prompt builder / chat composer** to the new
   `selectActivePath` — that's the *consumer* side and gets done
   feature-by-feature after Surface A is live.

---

## 9. Open questions / decisions to make before coding

1. **`get_user_scopes` vs `_with_projects` for boot.** Recommendation:
   `_with_projects`. Projects are needed in Surface A's tree; the extra
   payload is small. Tasks stay separate.
2. **TTL on the tree cache?** Default to "no TTL, invalidate on mutation."
   Revisit if we see stale-tree bugs.
3. **Tasks: store normalized or per-level lists?** Recommend per-level
   list (key by `level:id` → array of task summaries) for v1. A
   normalized `tasksById` map can be added later if cross-level dedup
   becomes useful.
4. **Cross-org scope activation.** When the user picks a scope from a
   non-active org, do we *snap* to that org, or refuse? Recommend:
   snap silently (the cascade rule already implies this). Document so
   nobody adds an `if (scope.org_id !== active.org_id) bail()` guard.
5. **Where does the new feature live?** Three options:
   - `features/scopes/` (fresh folder — clearest break).
   - Rebuild inside `features/scope-system/` (reuse existing home,
     replace contents).
   - Rebuild inside `features/agent-context/redux/` (where the active
     slice already is).
   Recommendation: **`features/scopes/`** — the rewrite is a clear
   enough break to warrant a new home, and it lets us delete the other
   two folders wholesale once consumers migrate.
6. **Single combined picker vs split.** Recommend starting **split**
   (`ScopeAssignmentPicker` + `EntityTargetPicker`). If they end up
   feeling redundant, merge later. The cost of splitting and merging is
   smaller than the cost of one over-configured component.

---

## 10. Phased migration

> Don't tear out the old code until the new one is wired and a couple of
> consumers have moved. Otherwise we'll spend a week chasing imports.

**Phase 1 — Foundation (no consumer changes yet)**
- New slice `features/scopes/redux/scopesSlice.ts`.
- Thunks: `ensureScopeTree`, `ensureTasksForLevel`, scope/scope_type CRUD,
  `setEntityScopes`.
- Selectors: tree selectors, `selectActivePath`.
- App boot fires `ensureScopeTree`.

**Phase 2 — Surface A**
- `<ActiveContextSelector />`, `<ActiveContextBreadcrumb />`, chips.
- Wire `OrgSidebar` / nav to the new component. Keep `appContextSlice`,
  retire `hierarchySlice` (its boot fetch is replaced).

**Phase 3 — Surface B**
- `<ScopeAssignmentPicker />`, `<EntityTargetPicker />`.
- Migrate the first two existing pickers (the worst offenders that
  currently mutate global state).

**Phase 4 — Teardown**
- Delete `features/agent-context/redux/scope/` (all four slices).
- Delete `features/agent-context/redux/hierarchy*`.
- Audit `features/scope-system/redux/` — delete what's redundant, keep
  context-items/values if Phase 2 of *that* sub-system hasn't shipped yet.
- Replace `contextService.ts` direct queries with the new thunks /
  RPCs feature-by-feature.

**Phase 5 — Context items + values (out of scope for v1, queued)**
- Separate plan once the tree layer is solid.

---

## 11. Things the user explicitly called out — pinned

- "Only one active at any time **but then everything it belongs to are
  automatically activated, not excluded.**" → §3 (cascade) + §6
  (`selectActivePath`).
- "When the user selects any level explicitly, we fetch all tasks for
  that level… background, fire and forget, auto hydrate, never fetch
  twice unless explicit refetch." → §5 (`ensureTasksForLevel`).
- "The global state selection is totally separate from these other
  things." → §3 invariant (Surface B never touches `appContext`).
- "Scopes are many-to-many, scope_types cannot be associated with
  things, org/project/task have FK." → §2 invariants + §3 picker modes.
- "Make it very very very easy to set the context across the app and
  then have things read from it." → §7 components + §6 single derived
  selector that consumers read.

---

## 12. Next step

Confirm the open decisions in §9 — especially:

1. New feature folder name (`features/scopes/`?).
2. Combined picker vs split.
3. Boot RPC (`get_user_scopes_with_projects` vs `get_user_scopes`).

After those three are nailed, Phase 1 (slice + thunks + selectors) is a
focused day of work and unblocks everything else.
