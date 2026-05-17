# FEATURE.md — `agent-context` (+ `brokers`)

**Status:** `active` (brokers production) / `migrating` (agent-context is being narrowed; scope CRUD has moved to [`features/scopes/`](../scopes/FEATURE.md))
**Tier:** `1` — foundational for every agent invocation.
**Last updated:** `2026-05-16`

> Combined doc: **brokers** (hierarchical variable resolver) and **agent-context** (its consumer that auto-fills declared context slots on an agent at invocation time). These two cannot be understood separately, but **neither owns scope as a data concept any more** — that lives in [`features/scopes/`](../scopes/FEATURE.md). Read that first; this doc covers the resolution mechanics that *consume* scope.

---

## Purpose

- **Brokers** (`features/brokers/`): hierarchical key→value resolver. A broker key declared at multiple levels resolves to the **nearest** match (most specific scope wins). SQL-backed.
- **Agent context** (`features/agent-context/`): the thin consumer that, at invocation time, builds the agent's context payload by:
  1. Calling the scope resolver in [`features/scopes/`](../scopes/FEATURE.md) for the request's resolved scope bundle (active scopes, entity tags, project, task — already merged into `ResolvedContext`).
  2. Walking the agent's declared **variables** (required) and **context slots** (optional auto-fills).
  3. Filling each slot from the broker chain + the resolved scope bundle + ambient sources (user profile, conversation history, selection).
  4. Never blocking on missing slots.

Scope CRUD, scope pickers, scope assignment to entities, the active-context sidebar — **all of those moved to [`features/scopes/`](../scopes/FEATURE.md).** This module is now just resolution + slot fill at the invocation boundary.

---

## The core distinction — variables vs context slots

> **Variables would leave the agent confused if missing. Context slots are things the agent can use to do an even better job.**

- **Variables** — named, declared inputs the agent **requires**. Each has a default UI component + help text (defined in Builder). Bound by name from `invocation.inputs.variables`. Block invocation when missing.
- **Context slots** — named, declared inputs **auto-filled** from ambient sources. Absence is graceful — the agent proceeds without them.
- **Everything else** — ambient data the agent hasn't declared a slot for — is reachable via **tool call**, not injection. The agent pulls what it needs.

---

## The broker hierarchy

```
Global
  └─ User
       └─ Organization
             └─ Scope               (the user-defined dimensions — see features/scopes)
                   └─ Project
                         └─ Task
                               └─ AI Run
                                     └─ AI Task
```

| Level | Resolves from | Example broker key |
|---|---|---|
| Global | platform defaults | `default_model`, platform flags |
| User | `users` row + preferences | preferred model, language, display name |
| Organization | `organizations` row | safety policies, default tools |
| Scope | active scopes + entity scope tags (via `features/scopes`) | brand voice, client tone, custom dictionary, the "50 datapoints per Client" |
| Project | `projects` row | domain glossary |
| Task | `tasks` row | task constraints |
| AI Run | `cx_conversation` row | per-conversation overrides |
| AI Task | per-turn record | per-turn overrides |

**Resolution rule:** nearest match wins. Falling through returns the next level up. Unresolved at all levels → `undefined`.

The **Scope** level is where the bulk of org-specific signal lives, and it's the level users actually author by hand. See [`features/scopes/FEATURE.md`](../scopes/FEATURE.md) for the data model, contradiction rules, and resolution algorithm that produces the scope-level inputs to broker resolution.

See [`features/brokers/INFO.md`](../brokers/INFO.md) for SQL schema, RPC functions, and concrete broker examples.

---

## Entry points

### Brokers (`features/brokers/`)

- `services/` — broker resolution + mutation
- `hooks/` — React hooks for read/write
- `examples/` — patterns to copy when wiring a new broker
- `types/` — `Broker`, scope level enums, resolution result types

### Agent context (`features/agent-context/`) — narrowed surface

- `service/contextVariableService.ts` — variable resolution (`resolve_full_context` RPC)
- `hooks/useContextVariables.ts` — React hook for the variable list / values
- `utils/scope-mapping.ts` (in `features/agents/`) — `ApplicationScope` type + resolver used by the launch flow
- *(post-Phase-5)* the rest of `features/agent-context/` — slices, services, components, scope-related hooks — is **deleted**. Code remaining here is only the broker-consumer + slot-fill surface.

### App context plumbing

- `lib/redux/slices/appContextSlice.ts` — global client state (`organization_id`, `scope_selections`, `project_id`, `task_id`, `conversation_id`). Moved here from `features/agent-context/redux/` during Phase 1 of the scopes rebuild. Injected into every API call by `assembleRequest()`.

---

## Data model

### `ApplicationScope` (UI-surface context handoff)

```ts
interface ApplicationScope {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}
```

A surface (notes, code editor, flashcard) builds an `ApplicationScope` object describing what the user is acting on. A Shortcut's `scopeMappings` translates those keys into the agent's variable / slot names. Lives at [`features/agents/utils/scope-mapping.ts`](../agents/utils/scope-mapping.ts).

### `appContext` (global)

`organization_id`, `scope_selections`, `project_id`, `task_id`, `conversation_id`. Injected into every API call by `assembleRequest()`. Stamped onto `cx_conversation.organization_id / project_id / task_id` server-side. **Owned by `lib/redux/slices/appContextSlice.ts`** — defined and written there; this feature only reads it.

### Variable vs slot definitions on an agent

Declared in the Builder, returned to clients on agent-load (no system prompt included). Variables are required; slots are optional auto-fills.

### `ResolvedContext` (from `features/scopes`)

```ts
interface ResolvedContext {
  values: Record<string, ItemValue>;            // context-item key → value, merged
  sourcePerKey: Record<string, ContextSource>;  // which scope/level provided each key
  contradictions: Array<{
    scopeTypeId: string;
    globalScopeId: string;
    localScopeId: string;
  }>;
  activeScopes: ContextSource[];
  organizationId: string | null;
  userId: string;
}
```

Returned by `selectResolvedContext()` (client) and `resolve_local_context()` / `resolve_active_context()` (server). This is the *primary input* to slot fill. See [`features/scopes/FEATURE.md`](../scopes/FEATURE.md) §"The resolution algorithm".

---

## Key flows

### Flow 1 — Slot fill at invocation

1. Agent declares a context slot `org_brand_voice`.
2. Client builds the invocation payload. For each declared slot:
   - Look up the key in `ResolvedContext.values` (from `features/scopes`). Hit → use it.
   - Miss → walk the broker chain: AI task → AI run → task → project → scope → org → user → global. First non-null wins.
   - Still miss → leave the slot `undefined`. Don't block.
3. Invocation proceeds.

### Flow 2 — Scope-mapping resolution (UI surface → agent)

1. A surface (code editor, notes, flashcard) builds an `ApplicationScope` with keys like `selection`, `content`, `vsc_active_file_content`.
2. A Shortcut's `scopeMappings` maps those UI keys to the agent's variable / slot names.
3. The resolver:
   - Key matches a declared variable → fills the variable.
   - Key matches a declared slot → fills the slot.
   - Key matches nothing → surfaces as ad-hoc context the agent can reach via tool call.

### Flow 3 — Active scope change (UI)

1. User picks a scope in `<ActiveScopePicker />` (in [`features/scopes`](../scopes/FEATURE.md)). `appContextSlice` updates.
2. Next agent invocation carries the new scope chain. Server stamps the new scope on the conversation.
3. Broker lookups for this conversation resolve from the new chain.

### Flow 4 — Locally-triggered action (entity-bound)

1. User triggers an agent from inside a tagged note (see `features/scopes` Flow 4).
2. Caller fetches `selectResolvedContext({ entityType: 'note', entityId })` — closest-wins merge of entity tags over global active.
3. Slot fill consumes the merged bundle. Contradictions are passed through in `ResolvedContext.contradictions` so multi-scope-aware agents can react.

### Flow 5 — Graceful missing slot

1. Slot `user_profile_summary` declared by an agent.
2. Caller has no profile loaded; no broker hit at any level; not in `ResolvedContext.values`.
3. Slot resolves to `undefined`. Invocation proceeds.
4. Agent works with what it has (or fetches via tool call if it really needs it).

---

## Invariants & gotchas

- **Variables block; context slots don't.** Never gate invocation on a missing slot.
- **Nearest scope wins** in broker resolution. Set a broker at the correct level — wrong-level declarations are silently misleading.
- **Broker values are read, not mutated, during invocation.** Writes happen through dedicated RPC paths.
- **`appContext` is the top-level client truth.** Keep it narrow — it rides on every API call.
- **Scope CRUD does not live here.** Pickers, taggers, slices, services for scope are in [`features/scopes/`](../scopes/FEATURE.md). The single most repeated bug in the old code was a "context picker" that secretly mutated `appContextSlice`; that's structurally impossible in the new module because Surface B never touches it.
- **Anything not declared as variable or slot** is reachable via tool call only, never injection.
- **Server stamps scope on the conversation** at first-turn time. Subsequent turns inherit.
- **Do not create per-feature scope state.** Use `appContextSlice` + broker resolution + `selectResolvedContext` — scattered scope state breaks the mental model.
- **ResolvedContext is the authoritative scope input.** When filling slots, prefer `ResolvedContext.values` over re-implementing your own scope walk. If a slot needs something `ResolvedContext` doesn't carry, that's a signal to extend the scope module, not bypass it.

### Personal-projects sentinel

`get_user_full_context` (legacy) and the new scope-tree RPCs synthesise a virtual **Personal** organization so personal projects (`projects.organization_id IS NULL`) appear inside the same nav-tree shape as real orgs.

```ts
export const PERSONAL_PSEUDO_ORG_ID = "00000000-0000-0000-0000-000000000001" as const;
export function isPersonalPseudoOrgId(id: string | null | undefined): boolean;
```

Rules:

1. **Storable in Redux / passable in UI props.** `<ActiveScopePicker />`, `useActiveContext`, and `appContextSlice.organization_id` may all carry the sentinel — that's how the UI knows to show "Personal" instead of "All organizations".
2. **Never send it to the backend.** The single API boundary (`lib/api/call-api.ts → resolveScope`) sanitizes it to `undefined` before any request. The canonical `features/projects/service.ts createProject` normalizes it to `NULL` before insert. New API code paths must do the same — use `isPersonalPseudoOrgId()` to guard.
3. **Never create routes under `/org/personal/...`.** Personal projects redirect to `/projects/{slug}/...` — `CreateProjectModal` and `ProjectFormSheet` already enforce this.

The sentinel's home moves from `features/agent-context/redux/hierarchySlice.ts` to `lib/redux/slices/appContextSlice.ts` during Phase 1 of the scopes rebuild. The export name and behaviour are preserved.

---

## Related features

- **Owns the scope data this module consumes:** [`features/scopes/FEATURE.md`](../scopes/FEATURE.md). Read first.
- **Foundational for:** [`features/agents/`](../agents/FEATURE.md) (every invocation uses this), [`features/agent-shortcuts/`](../agent-shortcuts/FEATURE.md) (scope mappings), [`features/agent-apps/`](../agent-apps/FEATURE.md).
- **Cross-links:** [`features/brokers/INFO.md`](../brokers/INFO.md), [`features/agents/agent-system-mental-model.md`](../agents/agent-system-mental-model.md) §2.

---

## Doctrine compliance

> Required by [PRINCIPLES.md](../../PRINCIPLES.md). The artifact is disposable; the platform is the product.

**Primitives reused**

- Types: `ResolvedContext`, `ContextSource`, scope/scope-type types — all imported from `features/scopes/types.ts`. Broker types from `features/brokers/types/`.
- Components: none directly — this module is invocation-time logic, not UI.
- Redux slices / selectors: `appContextSlice` (`lib/redux/slices/`), `selectResolvedContext` / `selectActiveContext` / `selectContradictions` (`features/scopes/`).
- Hooks: `useAppSelector`, `useAppDispatch`. `useActiveContext` / `useResolvedContext` from `features/scopes/hooks/`.

**Primitives introduced** *(post-narrow)*

- `contextVariableService.resolveVariables(...)` — Why a new service surface: variable resolution has a different lifecycle from slot fill (variables block, slots don't). Considered extending: folding into a single resolver. Rejected because: blocking vs non-blocking semantics need to stay distinct at the API.
- `useContextVariables(...)` — Why a new hook: variable hydration is required before invocation; the hook gates the launch button. No existing hook has this semantics.

If this list grows beyond 2-3 entries, re-read PRINCIPLES.md before merging.

---

## Current work / migration state

**Mid-narrow.** This module is shrinking. The scope CRUD that historically lived here has moved or is moving to [`features/scopes/`](../scopes/FEATURE.md). Watch the [scopes plan](../scopes/FEATURE.md#current-work--migration-state) for the phase-by-phase retirement schedule. Phase 5 of that plan removes everything in this folder *except* `service/contextVariableService.ts`, `hooks/useContextVariables.ts`, and any thin broker-consumer code that remains.

Until Phase 5 lands:

- The legacy slices in `redux/scope/`, `hierarchySlice.ts`, `organizationsSlice.ts`, `projectsSlice.ts`, `tasksSlice.ts` are still wired in `rootReducer`.
- The legacy components in `components/` still ship (and contain known bugs — chiefly the silent global-state mutation pattern documented in `features/scopes/FEATURE.md`).
- The legacy services `contextService.ts` and `hierarchyService.ts` still own `ctx_*` queries.
- `features/agent-context/hooks/useContextItems.ts` is **known stale** (see file-level TypeScript errors). Do not extend; consumers will be migrated to `features/scopes/hooks/useScopeValues.ts` in Phase 5.

---

## Change log

- `2026-05-16` — composer: narrowed scope of this doc. All scope CRUD content moved to [`features/scopes/FEATURE.md`](../scopes/FEATURE.md). Updated cross-links. Updated `appContextSlice` location (lib). Updated broker hierarchy table to use "Scope" as the level name (was "Workspace"). Added explicit deprecation pointers for everything to be deleted in Phase 5 of the scopes rebuild.
- `2026-05-01` — codex: documented `PERSONAL_PSEUDO_ORG_ID` sentinel rules; `get_user_full_context` now returns a virtual Personal org so personal projects appear in the nav tree; `lib/api/call-api.ts → resolveScope` strips the sentinel before any backend call.
- `2026-04-22` — claude: initial combined FEATURE.md for agent-context + brokers.

---

> **Keep-docs-live:** changes to slot fill semantics, variable resolution, the `ApplicationScope` shape, the broker chain, or `appContextSlice` must update this doc. Changes to scope data, picker behaviour, contradiction rules, or anything in `ctx_*` tables update [`features/scopes/FEATURE.md`](../scopes/FEATURE.md) instead.
