# FEATURE.md — `features/agent-context` (LOCAL MECHANICS ONLY)

> Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/scopes-context/STATE.md — read it before touching this feature in ANY repo.

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
   in `graveyard`, `broker_values` had 0 rows, zero importers). A hierarchical variable resolver,
   if ever wanted again, is a NEW design against live tables.
4. **Do not create per-feature scope state.** Use `appContextSlice` + `resolve_full_context` +
   `selectResolvedContext`.
5. **Personal organization is a real org row** (`organizations.is_personal = true`) — there is no
   frontend personal-org sentinel and none may be reintroduced.
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
- `features/agents/utils/scope-mapping.ts` — the `ApplicationScope` surface→agent key mapper (a
  Shortcut's `scopeMappings` translates surface keys into variable / policy names).
- `lib/redux/slices/appContextSlice.ts` — the global active-context slice (owned there, only
  read here).
