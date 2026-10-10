# FEATURE.md — `features/agent-context` (LOCAL MECHANICS ONLY)

> Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/data/scopes-context/STATE.md — read it before touching this feature in ANY repo.

**Status:** legacy, mid-teardown. Scope CRUD, pickers, tagging and the active-context sidebar all
live in [`features/scopes/`](../scopes/FEATURE.md). The model, the resolution contract, the
variables-vs-Context-Policies rules and the teardown plan were centralized into the
`scopes-context` node kit on 2026-08-25 (`STATE.md`, `DECISIONS.md`, `HANDOFF.md`,
`context-delivery/STATE.md`). Only directory-local rules remain here.

## 🚨 Rules an agent editing this directory must obey

1. **Do not build a client-side resolver.** Variable and Context Policy resolution is server-side
   in the `resolve_full_context` RPC. `contextVariableService` / `useContextVariables` were
   planned and never built — do not create them.
2. **Never gate an invocation on a missing Context Policy.** Variables block; policies do not.
3. **Do not resurrect `features/brokers/`** (deleted 2026-08-11 — every RPC dropped, every table
   in `deprecated`, `broker_values` had 0 rows, zero importers). A hierarchical variable resolver,
   if ever wanted again, is a NEW design against live tables.
4. **Do not create per-feature scope state.** Use `appContextSlice` + `resolve_full_context` +
   `selectResolvedContext`.
5. **Every organization is a real org row, and organizations are equal** (no personal or business
   type — law: `common-docs/policies/access-ladder.md`); there is no frontend org sentinel and none
   may be introduced.
6. **`hooks/useContextItems.ts` is known stale** (file-level TS errors). Do not extend it;
   consumers migrate to `features/scopes/hooks/useContextValues.ts`.
7. **The legacy slices here are still wired in `rootReducer`** (`redux/scope/`, `hierarchySlice`,
   `organizationsSlice`, `projectsSlice`, `tasksSlice`) and the legacy components still ship with
   the silent-global-mutation bug. Migrate a consumer off them rather than patching them.

## File map

- `redux/scope/`, `redux/hierarchySlice.ts`, `redux/hierarchyThunks.ts`,
  `redux/{organizations,projects,tasks}Slice.ts` — legacy state, still mounted.
- `service/contextService.ts`, `service/hierarchyService.ts` — legacy direct table access.
- `components/**` — legacy pickers/hubs, superseded by `features/scopes/components/`.
- `../aidream/apps/shared/chat/src/agents/utils/scope-mapping.ts` — the `ApplicationScope` surface→agent key mapper (a
  Shortcut's `scopeMappings` translates surface keys into variable / policy names).
- `lib/redux/slices/appContextSlice.ts` — the global active-context slice (owned there, only
  read here).

## Change Log

- 2026-10-09 — **Scope shapes are the package's.** `types.ts` drops the rows bound to the deprecated `context_items` / `context_item_values` tables and the old `fetch_hint` / sensitivity words; `constants.ts` keys `CONTEXT_POLICY_CONFIG` (was `FETCH_HINT_CONFIG`) and `SENSITIVITY_CONFIG` by the store's words (`@ai-matrx/records/scopes`). The second scope management screen (`components/scope-admin/**`) is deleted — `features/scopes/components/management/ScopesManager` is the one screen.

- 2026-10-01 — **A single-record read that misses is an answer, not an error.** `fetchTask`,
  `fetchProject` and `fetchOrg` read with `.maybeSingle()` (was `.single()`, which turned every
  deep link to a trashed / unseen / unknown row into a 406 PGRST116 red-tier capture — 3x live on
  `/tasks?task=…`). Each now fulfils a discriminated result — `skipped` | `missing` (+ `id`) |
  `loaded` (+ `task` / `project` / `org`) — and a `missing` drops any stale cached row from the
  slice. `hierarchyService.resolveAncestors` project/org reads moved to `.maybeSingle()` too.
  Guard: `redux/tasksSlice.fetchTask.test.ts` (7 tests, all failing on the old `.single()` reads).

- 2026-09-25 — **The hierarchy-selection family is gone** (`components/hierarchy-selection/`:
  `HierarchyCascade`, `HierarchyPills`, `HierarchyTree`, `useHierarchySelection`,
  `useReduxBridge`, `types`). Every caller now uses the canonical scope selection family —
  `features/scopes/components/active-context/engagement/EngagementPicker` (organization → project
  → task, scopes as tags; Miller Columns `rungs="engagements"`), `EntityEngagementPicker` (a
  record's FKs + `useEntityScopes` tags) and `useActiveEngagementSelection` (Surface A). A scope
  tag no longer filters the project list (that filter read `scopeAssignmentsSlice`). The
  shortcut rung picker moved to `binding-target/BindingTargetPicker`. `hierarchyService.createTask`
  files the task under the organization it is handed (the project's), not the active one.
  Lane HIERARCHY-CASCADE.

- 2026-09-17 — **A refused project or task create now REACHES the person.** `createProjectThunk` / `createTaskThunk` resolve the organization through `ensureOrgId`, which THROWS when no organization is selected. A rejected thunk on its own is a dead Create button, so both writes go through `withOrganizationRefusalShown` (`lib/organizations/organizationRefusalToast.ts`): the person is told the project/task was not created and where to pick an organization, and the throw still propagates so no surface shows a record that was never written. Guard: `pnpm check:org-refusal-honesty` (+ `:self-test`).

- 2026-09-17 — **`useHierarchySelection` no longer auto-selects the first organization.** The
  `autoSelectFirst` option seeded the org level with `orgs[0]` — whichever organization sorted
  first, which is not a choice the person made, and which the projects,
  tasks and scope reads below it then scoped to. It is now `autoSelectActiveOrg`: it seeds from
  the organization the person SELECTED (`appContext.organization_id`) when that is one of their
  memberships, and otherwise leaves the level empty so the cascade's own organization picker is
  the remedy. No caller passed the old option.
  Law: `../../../common-docs/policies/context-is-carried-never-rebuilt.md`.
