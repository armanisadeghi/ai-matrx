# FEATURE.md — `scopes`

**Status:** `scaffolded` — module being built ground-up to replace the sprawling scope/context layer across `features/agent-context/` and `features/scope-system/`. Code lands in phases; this doc is the canonical model from day one.
**Tier:** `1` — foundational for every agent invocation and every feature that filters, tags, or resolves by user-defined dimensions.
**Last updated:** `2026-06-26`

> This doc is the single source of truth for **scopes**. If something contradicts it (an existing slice, an old hook, a stale README), the doc wins and the code is wrong. Read this end-to-end before touching anything in `features/scopes/`, `features/agent-context/`, `features/scope-system/`, `app/(authenticated)/scopes/`, or any consumer that picks/tags/filters by scope.

---

## Purpose

A first-class home for **scope** — the user-authored dimensions inside an organization (Client, Department, Repo, Case, Patient, etc.). One module owns the tree, the values, the templates, the active picker, the entity tagger, and the resolution into the final context bundle the LLM receives.

---

## The conceptual model — context vs scope

These two words sound interchangeable. They are not. Confusing them is what produced the eight-slice sprawl this module replaces.

### Context

Everything the LLM needs to do its job for the current request. Assembled by the system at invocation time. Users never edit "context" directly as a thing.

Sources that flow into context, roughly in order of importance:

1. **Scopes** — highest signal. Each active scope contributes ~N field values (the "50 datapoints per Client" pattern).
2. **Organization** — the umbrella that owns the scope types.
3. **Project / Task** — the work spine. Useful but lower signal than scope.
4. **User** — preferences, role, identity.
5. **Ambient** — selection, open file, conversation history, cached recents.

### Scope

The user-defined dimensions inside an org. Each scope type is a dimension (`Client`, `Department`); each scope is a value on that dimension (`Dr. Nazarian`, `Rejuvina Medspa`, `SEO`, `Content Writing`). Each scope holds context items (the columns) and context item values (the cells).

Scope is the most important *part* of context, not its synonym. Why important? Because it is the only piece of context users **author by hand** — the org admin decides which dimensions matter, then fills the cells once, and that work feeds every downstream invocation forever.

### Why the distinction matters — the Liquid Facelift example

> User asks: "Can you help me come up with some good keywords for *Liquid Facelift*?"

**Run 1 — context bundle:**

- User: Joe Smith, SEO Content Writer
- Org: XYZ Marketing, Inc.
- Scopes:
  - Department: Content Writing
  - Client: Dr. Nazarian Plastic Surgery

The agent's response is a content writer's brief on Liquid Facelift, framed as a great alternative to plastic surgery, comparing both fairly so people pick what's best for them. No SEO-technical jargon.

**Run 2 — change only the scopes:**

- User: Joe Smith, SEO Content Writer
- Org: XYZ Marketing, Inc.
- Scopes:
  - Department: SEO
  - Client: Rejuvina Medspa

Without the user touching any prompt, the response transforms:

- The user is now an SEO expert — give technical guidance, not fluff.
- The client is a medspa, not a plastic surgeon — push non-surgical alternatives, downplay surgery options.
- Keywords should push readers away from surgery toward non-surgical procedures.

Two completely different LLM outputs from two scope changes. **The scope didn't change what the user asked — it changed what "good" means for this request.** That's the entire reason this module exists.

### Templates

Templates are just "quick start" — a bundle of `scope_types + context_items` for a known industry. Applying a template to an org bootstraps the dimensions and the columns, then the user fills in the cells. Templates are read-only catalog data, not part of any active context.

---

## Global vs local context — the load-bearing invariant

This is the #1 invariant. Misunderstanding it is what made the old code rot.

### Global context

What the user is working on *right now*. Lives in `appContextSlice`. Used by anything not tied to a specific entity (the sidebar, the chat composer at the top level, "create a new note" without a parent, "run this agent" from the home screen).

```
appContextSlice = {
  organization_id,
  scope_selections: Record<scope_type_id, scope_id>,   // exactly one scope per type
  project_id,
  task_id,
  conversation_id,
}
```

### Local context

The context attached to a specific entity (a note, a task, an agent, an attachment, anything). A scope tag is the unified edge in `platform.associations` (`source=(entityType, entityId) → target=('scope', scopeId)`), reached via `scopesService` / `associationsService` — never written directly. (The old `ctx_scope_assignments` M2M table is graveyarded; data was copied to `platform.associations` on 2026-06-24 and no FE code references it.) The entity's own FK columns (`project_id`, `task_id`, `organization_id`) still carry their part too.

### The invariant

> **Global context is ONLY written by things that explicitly modify global context.**

A picker that says "tag this note with Client: Rejuvina" writes the local scope tag via `scopesService.setEntityScopes` (a `platform.associations` edge). Period. It never dispatches `setOrganization` / `setActiveScope` / anything that touches `appContextSlice`.

This rule kills the #1 bug in the old code: every helpful picker silently mutated the sidebar. Opening a note to tag it with a scope quietly redirected the entire app's active context. That stops here.

### Resolution rule — closest-to-action wins

Locally-triggered actions read local-first, with global as optional fallback:

1. Action fired from inside a note context-menu → resolver consults the note's tagged scopes first.
2. For any context item key not provided by local scopes → fall back to the global active scopes.
3. For non-collision dimensions → take the union (global Department + local Client both apply).

Globally-triggered actions (the chat composer at the app level, the home agent runner, anything not entity-bound) read global only.

### Concrete example

- Global active: `Client: Dr. Nazarian`, `Department: Content Writing`
- Note open. Note tagged with: `Client: Rejuvina`
- User runs a context-menu agent on a selection in the note ("clean up transcription").

The agent receives:

- `Client: Rejuvina` (local wins on collision)
- `Department: Content Writing` (no local override, global flows through)
- All context-item values for `Rejuvina`, then any `Content Writing` values not provided by Rejuvina.

Result: the transcription uses Rejuvina's custom dictionary. If the audio mentions "Dr. Nazarian," the agent might misspell it — and **that's acceptable**, because transcription is single-scope by nature. The user wanted Rejuvina's dictionary; they got it. If they want multi-scope dictionaries, that's a feature they can build.

---

## Contradiction warnings — never blocks, only informs

A "contradiction" is **two scopes of the same scope type active simultaneously** between global and local. That's it. Different dimensions are not contradictions.

| Situation | Status |
|---|---|
| Global: `Client: Dr. Nazarian`. Local: `Department: SEO`. | Not a contradiction — different scope types. Both apply. |
| Global: `Client: Dr. Nazarian` + `Department: Content Writing`. Local note tagged `Client: Rejuvina`. | **Contradiction on `Client`.** Show notice. |
| Global: `Client: Dr. Nazarian`. Local task tagged `Client: Dr. Nazarian` + `Department: SEO`. | Not a contradiction — same Client, plus a new dimension. |

### UX

- Render a small notice at the top of the **local view** when the user opens an entity whose tagged scopes contradict the current global active scopes on any scope type.
- Notice copy: "This [note/task/agent] is scoped to *Rejuvina Medspa*, but your active context has *Dr. Nazarian*. Locally-triggered actions will use *Rejuvina*. Globally-triggered actions still use *Dr. Nazarian*."
- Never block. Multi-scope-aware agents handle it; single-scope agents will produce worse output — informing the user is enough.
- The notice lives where the user is acting from (inside the entity view). The global sidebar doesn't show contradictions because globally-scoped actions are not affected.

### Why this is the right rule

95% of agents are built scoped to one thing — they'll behave unexpectedly under contradiction. But 5% are built to handle multi-scope (joint articles, comparison analyses, cross-org research). Hard-blocking would break the 5% and force them to either churn the global context or work around the system. Warning informs without restricting.

---

## Multi-scope picker rules

Both pickers (global and local) follow the same selection grammar.

| Axis | Cardinality |
|---|---|
| Organization | 1 (implied by the scopes' owning org) |
| Scope per scope_type | exactly 1 (within-type collision is invalid because context-item values would collide) |
| Number of scope_types active | 0..N (across-type is fully additive) |
| Project | 0..1 |
| Task | 0..1 |

Adding a scope of type `T` when type `T` already has an active scope **replaces** the previous selection. Cascade-replace; no confirm.

Clicking the same active scope again **deactivates** it.

Across types: clicking is purely additive. Adding `Client: X` does not touch `Department`, `Repo`, or any other type.

Cross-org: picking a scope from a different org snaps the active org to that scope's org (it has to — scopes live in exactly one org). The sidebar updates; consumers re-resolve.

---

## Orphan handling — empty ≠ not-fetched

Some projects have no scope association. Some tasks have no project or scope. They are first-class, not bugs. Users expect them in the tree.

### UI rule

Every level of the tree shows an **"Other"** bucket at the bottom:

- Under an org: "Other projects" (projects in this org with no scope association).
- Under a scope or project: "Other tasks" (tasks with no parent scope/project).

### State machine

Each "Other" bucket carries its own load state, distinct from the tree's overall state:

```ts
type OrphanBucketStatus =
  | 'unfetched'  // user has not asked yet; render "Load others"
  | 'loading'    // fetch in flight
  | 'ready'      // populated; render the list
  | 'empty'      // fetched, none exist; render "No others"
  | 'error';     // fetch failed; render retry
```

`unfetched` and `empty` are different states with different UI. Showing "No others" before the user has asked is a lie.

### Why lazy

Orphan fetches are skipped at boot because they're chatty and not needed for first paint. The user clicks "Load others" → fetch fires → state transitions through `loading` → `ready`/`empty`.

---

## Fetching invariants

Read these out loud before adding any thunk.

1. **One root tree fetch at boot.** RPC: `get_user_scope_tree_with_projects`. Returns orgs → scope_types → scopes → projects. Bundled because every Surface A render needs projects.
2. **Tasks are never in the root fetch.** Too chatty. Tasks are loaded per-level on user selection (`list_scope_tasks(level, id)`), cached by `{level}:{id}`.
3. **No refetching ever, except on an explicit user refresh click.** A thunk fired twice from a render cycle or a route change is a bug, not a feature.
4. **Boot fetch is deferred and low-priority.** It runs after critical UI is painted. The tree is needed for sidebar interactivity, not initial render.
5. **Cache invalidation is mutation-driven.** Successful mutations patch the tree in place. No "stale time" magic.
6. **Empty ≠ not-fetched.** State must distinguish. Selectors return `unfetched` distinct from `empty`.
7. **In-flight dedup.** A thunk that finds a `loading` state in its target slot returns the in-flight promise instead of starting a second one.
8. **Single chokepoint.** All Supabase calls for `ctx_*` tables go through `features/scopes/service/scopesService.ts`. Enforced by ESLint rule.

---

## The resolution algorithm

Pseudocode for "given the entity I'm acting on and the global context, what's the final context bundle?"

```ts
function resolveContext(opts: {
  entityType?: 'note' | 'task' | 'agent' | ...;
  entityId?: string;
  activeContext: AppContext;
  userId: string;
}): ResolvedContext {
  const sources: ScopeContribution[] = [];

  // 1. Local scopes (closest to action, win on collision)
  if (opts.entityType && opts.entityId) {
    const localScopeIds = getEntityScopes(opts.entityType, opts.entityId);
    for (const scopeId of localScopeIds) {
      sources.push({ scope: scopeId, origin: 'local', priority: 1 });
    }
  }

  // 2. Global active scopes (fallback for keys not provided locally)
  for (const [typeId, scopeId] of Object.entries(opts.activeContext.scope_selections)) {
    sources.push({ scope: scopeId, origin: 'global', priority: 2 });
  }

  // 3. Project / Task FK contributions
  if (opts.activeContext.project_id) {
    sources.push({ project: opts.activeContext.project_id, origin: 'global', priority: 3 });
  }
  if (opts.activeContext.task_id) {
    sources.push({ task: opts.activeContext.task_id, origin: 'global', priority: 4 });
  }

  // 4. Resolve: walk every context item key declared on every contributing scope type,
  //    pick the lowest-priority (= closest) source that provides a value.
  const merged: Record<string, ItemValue> = {};
  const sourcePerKey: Record<string, ContextSource> = {};
  for (const source of sources.sort(byPriority)) {
    for (const item of getContextItems(source)) {
      if (merged[item.key] === undefined) {
        merged[item.key] = item.value;
        sourcePerKey[item.key] = source;
      }
    }
  }

  // 5. Detect contradictions: scope types with both a local and a global selection
  //    on different scope ids.
  const contradictions = detectContradictions(sources);

  return {
    values: merged,
    sourcePerKey,
    contradictions,
    activeScopes: sources.filter(s => s.scope),
    organizationId: opts.activeContext.organization_id,
    userId: opts.userId,
  };
}
```

Server-side equivalents live as RPCs: `resolve_active_context()` (no entity — globally-triggered actions) and `resolve_local_context()` (with entity — locally-triggered actions). See `features/scopes/docs/RPC_CONTRACTS.md`.

### Live delivery path — how scope cells reach the agent

The shipped path (2026-06-10) is server-side: `resolve_full_context(p_user_id, p_entity_type, p_entity_id, p_scope_ids DEFAULT NULL)` — the one RPC behind aidream's `build_agent_context`. Migration: `migrations/ctx_resolve_full_context_scope_cells.sql`.

1. **Contributing scopes** = the entity's `ctx_scope_assignments` tags (project-tag fallback) ∪ the request's explicit `scope_ids` (membership-validated against the user; foreign ids dropped).
2. **Cells flow:** every CURRENT `ctx_context_item_values` cell of every ACTIVE item (`fetch_hint != 'never'`) on those scopes merges into the `variables` output as `{value, type, inject_as:'direct', source:'scope:<name>', description}` — rendered into the agent's system-prompt context block.
3. **Brokers override cells** on key collision — `ctx_context_variables` are deliberate injections; their loop runs after the cell merge.
4. **FE feeds it twice:** `assembleRequest` sends `scope_ids` (the active `scope_selections` values) on every turn, and the `syncConversationScopes` thunk stamps the selections onto the conversation's tags at send time — **union, never replace** (manual Surface B tags survive; a globally-deselected scope is not untagged).

---

## Data model

### Tables

All `ctx_*` tables. Owned by this module; only `scopesService.ts` may query them.

| Table | Role |
|---|---|
| `ctx_scope_types` | Dimensions defined inside an org (Client, Department, Repo). `organization_id`, `label_singular`, `label_plural`, `icon`, `color`, `max_assignments_per_entity`, `default_variable_keys`, `parent_type_id` (for nesting). |
| `ctx_scopes` | Values on a dimension (Dr. Nazarian, Rejuvina). `scope_type_id`, `organization_id`, `name`, `description`, `parent_scope_id` (for nesting), `settings`. |
| `ctx_context_items` | The "columns" — fields defined on a scope type. `scope_type_id`, `key`, `display_name`, `value_type`, `fetch_hint`, `sensitivity`, `category`, `depends_on`, `is_active`. |
| `ctx_context_item_values` | The "cells" — values per scope instance. `context_item_id`, `scope_id`, `is_current`, `version`, one of `value_text` / `value_number` / `value_boolean` / `value_json` / `value_document_url` / `value_reference_id`, plus audit fields. |
| `ctx_scope_assignments` | **DROPPING — moved to `platform.associations` (data copied 2026-06-24).** Was the M2M scope↔entity join table. A scope tag is now the unified edge `source=(entityType, entityId) → target=('scope', scopeId)`, reached through the `assoc_*` RPCs via `associationsService`. **No frontend code references this table or its RPCs any more** (2026-06-25): the chokepoint, `scopeAssignmentsSlice`, the notes thunk, `AssignedScopesDisplay`, and `ProjectsHub` are all on `platform.associations`. Remaining readers are DB-side only — the `get_entity_scopes`/`set_entity_scopes`/`list_entities_by_scopes` RPCs and `resolve_full_context*` still read it; drop/repoint those (DB+Python) before dropping the table. |
| `ctx_context_access_log` | Append-only fetch audit. `context_item_id`, `value_id`, `accessed_at`, `was_useful`. Powers usage analytics. |
| `ctx_templates` | Read-only quick-start catalog. `key`, `name`, `category`, `icon`, `is_active`, `sort_order`. |
| `ctx_template_scope_types` | Scope types defined by a template. `template_id`, `label_singular`, `label_plural`, etc. |
| `ctx_template_context_items` | Context items defined by a template. `template_scope_type_id`, `key`, `display_name`, `value_type`, etc. |

### Containment

```
organizations
  └─ ctx_scope_types         (dimensions defined per org)
       └─ ctx_scopes         (values on a dimension; can nest via parent_scope_id)
            └─ ctx_context_items     (columns defined on the dimension)
                 └─ ctx_context_item_values   (cells; one current row per (item, scope))

orgs / projects / tasks / notes / agents / ...
  └─ platform.associations   (scope→entity tags; was ctx_scope_assignments, graveyarded)
```

### Resolution flow

```mermaid
flowchart TD
  Trigger["User action"]
  Trigger --> Q1{"Bound to an entity?"}
  Q1 -- "yes" --> Local["Read entity scope tags (platform.associations via scopesService)"]
  Q1 -- "no" --> GlobalOnly["Read appContext only"]
  Local --> Global["Read appContext scope_selections"]
  Global --> Merge["Merge: local wins on same scope_type collision"]
  GlobalOnly --> Merge2["Use appContext as sole source"]
  Merge --> Items["Walk context_items for every contributing scope_type"]
  Merge2 --> Items
  Items --> Values["Pick value from closest scope per item key"]
  Values --> Bundle["ResolvedContext bundle"]
  Bundle --> LLM["Sent to LLM at invocation"]
```

---

## The unified association edge — `platform.associations`

The canonical **"associate ANY entity to ANY entity"** primitive, owned by this module. It replaces scattered `project_id`/`task_id` FK tagging and per-feature M2M tables (`ctx_scope_assignments`, `ctx_task_associations`, …) with **one polymorphic edge table**. Read this before adding any "tag / link / attach this to that" relationship anywhere in the app — extend the edge, never spin up a new M2M table or FK column.

`platform.associations(source_type, source_id, target_type, target_id, organization_id, label, metadata, role, position, created_by, created_at)`. The unique key is the **5-tuple** `(source_type, source_id, target_type, target_id, role)` `NULLS NOT DISTINCT` (`associations_unique`) — any ON CONFLICT must list all five. There is **no CHECK constraint** on the type columns; the only DB gate is the **validated FK** `source_type`/`target_type → platform.entity_types.token`, so any registered token is accepted as source OR target.

**Entity vocabulary is GENERATED, not hand-maintained.** `types/generated/entity-types.generated.ts` mirrors `platform.entity_types` 1:1 (216 tokens) via `pnpm gen:entity-types` (reads the public `entity_types_list()` RPC; `pnpm check:entity-types` screams on drift; folded into `pnpm sync-types`). It exports `EntityTypeToken` (the full FK-valid union — use it for any source/target-type argument), the runtime `isEntityTypeToken` guard + `ENTITY_TYPE_TOKENS` set, `ENTITY_TYPE_METADATA`, and curated subsets. `AssociationTargetType` (`types.ts`) is a curated "deliberate container" list proven valid at compile time with `satisfies readonly EntityTypeToken[]` — it can never drift to an unregistered token. The legacy hand-written `EntityType` union persists for existing scope-tag/favorites consumers and is converging onto `EntityTypeToken` (do not extend it — add tokens to the registry + regenerate). KNOWN HOLE: `agent_app` is in `EntityType` but is NOT a registered token (no `aga_apps` table) — a `source_type='agent_app'` write FK-violates; tracked for the association-cleanup pass.

### The primitive (all under `features/scopes/`)

| Layer | What |
|---|---|
| **Service** | `service/associationsService.ts` — the **SOLE chokepoint** for the `assoc_*` RPCs. No other file may call them. Returns `ScopesRpcResult`, never throws. **Every method runs pre-flight guards** (`service/associationGuards.ts`) BEFORE the RPC: `checkToken` (token registered in the generated set) + `checkUuid`/`checkUuidArray` (real UUID, not a "cute" string). A bad token/id becomes a described `invalid_argument` result + a loud `console.error` — caught in the editor/console, never as an opaque PG `22P02`/`23503`. |
| **Helpers** | `service/associationHelpers.ts` — typed composite wrappers over the chokepoint (no new DB): `linkEdges` (batch), `linkOneToMany` (one source → many containers), `linkManyToOne` (many sources → one container), `replaceTargets` (set-semantics pass-through), `linkCreated` (wire edges onto a just-inserted row), `unlinkEdges`. Source = `EntityTypeToken`, target = `AssociationTargetType` — both compile-checked. |
| **Hook** | `hooks/useAssociations({ type, id }) → { edges, status, add, remove, setTargets, reload }` — the public API UI consumes. Components never touch the slice, thunks, or service directly. (`useEntityRelationships` is an alias.) |
| **Component** | `components/associations/EntityAssociator.tsx` — the reusable panel; fed `sourceType` + `sourceId`, renders an entity's durable relationships (both directions) as chips + per-target-type "Add". Reuses the scope-tree pickers. |
| **Redux** | `redux/scopesSlice.ts` `associationsByKey` cache (keyed `${type}:${id}`); `redux/thunks/associations.ts` (load/add/remove/setTargets); `redux/selectors/associations.ts` `selectAssociationsFor`. |

`assoc_for_entity(p_type, p_id)` returns **both directions** in one round-trip — `direction` is relative to the queried entity (`outgoing` = it is the source; `incoming` = it is the target). `EntityAssociator` lets you detach only `outgoing` edges (this entity authored them); `incoming` are read-only.

### Data path — PUBLIC SECURITY-DEFINER RPCs

`authenticated` has **no direct grant** on `platform.*`, so every read/write goes through SECURITY-DEFINER RPCs (org-filtered inside the function via `iam.has_org_access(organization_id)`): `assoc_for_entity` (read, both directions for one entity), `assoc_for_targets` (batch read by target — members of many containers/scopes), `assoc_for_sources` (batch read by source — targets of many entities, e.g. the scope tags of N rows; optional `p_target_type` filter), `assoc_add` (idempotent single edge), `assoc_remove`, `assoc_set_targets` (replace-semantics for one target type, the set-counterpart of `setEntityScopes`), `assoc_remove_for_entity` (purge both directions). Service methods: `listForEntity` / `listForTargets` / `listForSources` / `add` / `remove` / `setTargets` / `removeForEntity`. Migrations: `assoc_public_rpcs.sql`, `assoc_for_targets_rpc.sql`, `assoc_for_sources_rpc.sql`, `assoc_remove_for_entity_rpc.sql`, `assoc_m2m_mirror_triggers.sql`. (Live column is `organization_id`; the older `assoc_public_rpcs.sql` file text drifted to `org_id` — live DB is authoritative.)

### Transition contract — old tables are MIRRORED, not yet dropped

Reads can move to `platform.associations` **now**; the column/table drops are a later destructive wave. Until then, triggers keep the edge in sync with the legacy storage:

- **33 FK mirrors** + the 2 new M2M mirrors (`ctx_scope_assignments`, `ctx_task_associations` via `platform._mirror_m2m_to_assoc`) replicate every legacy `project_id`/`task_id` write and M2M row into `platform.associations`.
- **War Room writes associations directly** (no mirror) — it is already native to the edge.
- **One entity vocabulary** (reconciled 2026-06-24): the `ctx_scope_assignments` path and association code share the single `EntityType` union — the divergent `ScopeAssignmentEntityType` subset is deleted. `EntityType` carries the 15 registry tokens + the 3 live app entity types (`agent_app`, `agent_surface_binding`, `page_extraction_job`); the dead `agent_shortcut`/`project_resource` tokens were dropped.

### The invariant — durable association ≠ active working context

> **Association thunks NEVER write `appContextSlice`.** A durable edge is a stored relationship; it is NOT the user's active working context (Surface A owns `appContextSlice`). An `EntityAssociator` on a surface must never change the sidebar's active context — the same load-bearing rule that governs Surface B tagging.

---

## The canonical taxonomy — `platform.categories`

The canonical **faceted category** primitive, owned by this module. **One table**, partitioned by `dimension` (the facet — `agent-shortcut`, `skill`, `industry`, `context-item`, …), replacing the fragmented per-feature category systems (`shortcut_categories`, `skl_categories`, the hardcoded `INDUSTRY_CATEGORIES` / `DEFAULT_CATEGORIES` arrays). Read this before adding any "category / tag list / picklist of groupings" anywhere — **add a `dimension`, never a new category table or hardcoded array.** Known facets are enumerated in `features/scopes/categoryDimensions.ts` (`CATEGORY_DIMENSIONS`).

`platform.categories(id, org_id, dimension, name, slug, parent_id, is_system, color, icon, position)`. `org_id IS NULL` = **system / global** category (visible to everyone); a non-null `org_id` = org-owned. `dimension` is free text — a new facet needs **no migration**.

### The primitive (all under `features/scopes/`)

| Layer | What |
|---|---|
| **Service** | `service/categoriesService.ts` — the **SOLE chokepoint** for the `cat_*` RPCs. No other file may call them. Returns `ScopesRpcResult`, never throws. |
| **Hook** | `hooks/useCategories({ dimension }) → { categories, status, create, reload }` — the public API UI consumes. Components never touch the slice, thunks, or service directly. |
| **Redux** | `redux/scopesSlice.ts` `categoriesByDimension` cache (keyed by `dimension`); `redux/thunks/categories.ts` (load/create); `redux/selectors/categories.ts` `selectCategoriesFor`. |
| **Types** | `PlatformCategory` / `CategoriesEntry` / `CategoryDimension` in `types.ts`. |

### Category is the noun; association is the verb

**ASSIGNING a category to an entity is NOT a category concern — it reuses the association edge.** `category` is already a valid `AssociationTargetType`, so tagging is `useAssociations(...).add({ targetType: 'category', targetId })`. There is **no category-assignment table** and never will be. `categoriesService` owns the category nouns; `associationsService` owns the assignment edges.

### Data path — PUBLIC SECURITY-DEFINER RPCs (read + create only)

`authenticated` has **no direct grant** on `platform.*`. The live surface is **two** RPCs (migration `migrations/user_state_and_category_rpcs.sql`): `cat_list(p_dimension?)` (system + my-org, org-filtered by `iam.has_org_access`) and `cat_create(p_dimension, p_name, p_org_id, …)` (org category only — forces `is_system=false`, so **system seeds are a migration**, never a client write).

> **No mutation surface yet.** There is no `cat_update` / `cat_delete` / `cat_reparent`. Read-only dimensions (the hardcoded arrays) migrate **now**; the stateful editors (`skl_categories`, `shortcut_categories` — they rename / recolor / reparent / delete) need those RPCs **first**.

---

## Redux shape

One canonical tree slice plus two sidecars. Replaces eight existing slices.

> **Phase 1 mount keys** (current state):
> - `state.scopesTree` — the canonical tree (new slice)
> - `state.contextValues` — high-churn sidecar
> - `state.scopeTemplates` — read-only catalog
> - `state.appContext` — already at canonical `lib/redux/slices/`
>
> Why `scopesTree` instead of `scopes`: the legacy entity-adapter slice
> still owns `state.scopes` until Phase 5. Once the retirement inventory
> below is cleared, the new slice will be remounted at `state.scopes`
> and this note will be removed.

### `scopesSlice` — the canonical tree

```ts
interface ScopesState {
  organizations: Record<string, OrgNode>;
  organizationIds: string[];                    // stable order: personal first, then alpha

  treeStatus: 'idle' | 'loading' | 'ready' | 'error';
  treeError: string | null;
  treeFetchedAt: number | null;

  // Per-level task cache. Key: `org:<id>` | `scope:<id>` | `project:<id>`.
  tasksByKey: Record<string, TaskBucketEntry>;

  // Orphan buckets — distinct from tree status.
  orphanProjectsByOrg: Record<string, OrphanBucket<ProjectNode>>;
  orphanTasksByLevel: Record<string, OrphanBucket<TaskNode>>;
}

interface OrgNode {
  id; name; slug; is_personal; role;
  scope_types: ScopeTypeNode[];                 // each with nested scopes[]
  projects: ProjectNode[];                      // present after _with_projects fetch
}

interface ScopeTypeNode {
  id; label_singular; label_plural; icon; color;
  max_assignments_per_entity: number | null;
  scopes: ScopeNode[];                          // can nest via parent_scope_id
}

interface OrphanBucket<T> {
  status: 'unfetched' | 'loading' | 'ready' | 'empty' | 'error';
  items: T[];
  fetchedAt: number | null;
  error: string | null;
}

interface TaskBucketEntry {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  taskIds: string[];
  fetchedAt: number | null;
}
```

### `contextValuesSlice` — high-churn sidecar

Separated because per-scope field values change frequently and have a different lifecycle from the tree.

```ts
interface ContextValuesState {
  byScope: Record<string, ScopeValuesEntry>;    // key: scopeId
}

interface ScopeValuesEntry {
  status: 'idle' | 'loading' | 'ready' | 'error';
  fetchedAt: number | null;
  values: Record<string, ContextItemValue>;     // key: context_item_id
  drafts: Record<string, Partial<ContextItemValue>>;   // unsaved edits
}
```

### `templatesSlice` — read-only catalog

Long TTL, rarely changes.

```ts
interface TemplatesState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  templates: ContextTemplate[];
  fetchedAt: number | null;
}
```

### `appContextSlice` — moves to `lib/redux/slices/`

```ts
interface AppContextState {
  organization_id: string | null;
  scope_selections: Record<string, string>;     // scope_type_id → scope_id
  project_id: string | null;
  task_id: string | null;
  conversation_id: string | null;
}
```

Promoted to `lib/redux/slices/` because it is used by `assembleRequest`, the proxy, every agent invocation, every consumer in `notes` / `tasks` / `projects` / `research` / `agents`. Putting it in `lib` makes its "app-global" status visible at the import path. Everything inside `features/scopes/` reads it via selectors; nothing inside `features/scopes/` defines it.

### Action contract

Only Surface A components may dispatch the action creators below. Enforced by exporting the action creators *only* through `features/scopes/redux/active-context-actions.ts`, which ESLint restricts to be imported only from `features/scopes/components/active-context/**`.

```ts
// active-context-actions.ts (restricted import)
setActiveOrg(orgId: string | null)
addActiveScope(scopeId: string)              // replaces any existing scope of the same type
removeActiveScope(scopeId: string)
clearActiveScopesOfType(typeId: string)
setActiveProject(projectId: string | null)
setActiveTask(taskId: string | null)
setActiveConversation(conversationId: string | null)
```

Every other surface that wants to "set a scope on a thing" goes through `setEntityScopes()` thunks (`scopesService` → `platform.associations`), never `appContextSlice`.

### Selectors

```ts
// tree selectors
selectScopeTree
selectOrgsById
selectScopeTypesForOrg(orgId)
selectScopesForType(typeId)
selectProjectsForOrg(orgId)
selectOrphanProjectsForOrg(orgId)             // includes status + items
selectTasksForLevel(level, id)                // includes status + items

// active-context selectors
selectActiveContext                           // returns the assembled bundle
selectActiveScopeIds
selectActiveScopesByType
selectActiveScopeOfType(typeId)

// resolution selectors (DERIVED)
selectLocalContextFor(entityType, entityId)   // entity-bound scopes only
selectResolvedContext({ entityType?, entityId? })  // full algorithm; closest wins
selectContradictions({ entityType?, entityId? })   // returns Array<{ typeId, globalScopeId, localScopeId }>
```

### What gets deleted (slice inventory)

| Old slice | Replaced by |
|---|---|
| `features/agent-context/redux/scope/scopeTypesSlice.ts` | `scopesSlice` (selectors) |
| `features/agent-context/redux/scope/scopesSlice.ts` | `scopesSlice` (selectors) |
| `features/agent-context/redux/scope/scopeAssignmentsSlice.ts` | thunks now flow through `scopesService` (`platform.associations`); no longer call the legacy `get_entity_scopes`/`set_entity_scopes`/`list_entities_by_scopes` RPCs |
| `features/agent-context/redux/scope/scopeContextSlice.ts` | DELETED (2026-06-26) — was dead (0 importers); resolution is the `resolve_full_context` RPC, `contextValuesSlice` covers cell reads |
| `features/agent-context/redux/hierarchySlice.ts` | `scopesSlice` |
| `features/agent-context/redux/hierarchyThunks.ts` | `features/scopes/redux/thunks/` |
| `features/agent-context/redux/organizationsSlice.ts` | folded into `scopesSlice` orgs (or moves to `features/organizations` if any logic remains) |
| `features/agent-context/redux/projectsSlice.ts` | folded into `scopesSlice` projects (or moves to `features/projects`) |
| `features/agent-context/redux/tasksSlice.ts` | folded into `scopesSlice` `tasksByKey` (or moves to `features/tasks`) |
| `features/scope-system/redux/contextItemsSlice.ts` | derived from the tree via `selectContextItemsForType` |
| `features/scope-system/redux/scopeValuesSlice.ts` | `contextValuesSlice` |
| `features/scope-system/redux/templatesSlice.ts` | `templatesSlice` |

---

## Entry points

### Routes

- `app/(authenticated)/scopes/` — main hub: current active scopes, tree explorer, recently used.
- `app/(authenticated)/scopes/manage/` — admin: scope types and scopes CRUD.
- `app/(authenticated)/scopes/manage/[typeId]/` — scope type detail + context-items editor.
- `app/(authenticated)/scopes/[scopeId]/` — scope detail + values grid + history + activity.
- `app/(authenticated)/scopes/templates/` — template gallery + apply flow.
- `app/(authenticated)/scopes/settings/` — scope-related preferences.
- `app/(a)/organizations/[orgId]/scopes/` — thin wrapper; sets the org filter and reuses the same components.

### Hooks (all under `features/scopes/hooks/`)

- `useActiveContext()` — read `selectActiveContext`. The universal consumer-side API.
- `useScopeTree({ orgId? })` — read the tree; trigger boot if not already.
- `useScopeValues(scopeId)` — read + mutate values for a scope. Replaces the `useContextItems.ts` mess.
- `useScopeAssignments(entityType, entityId)` — read + mutate M2M assignments. Replaces `useScopeAssignment.ts`.
- `useTemplates()` — read templates.
- `useResolvedContext({ entityType?, entityId? })` — read the merged bundle for an entity-bound action.
- `useContradictions({ entityType?, entityId? })` — read collision list.
- `useAssociations({ type, id })` — read + mutate an entity's `platform.associations` edges (both directions). See §"The unified association edge".
- `useCategories({ dimension })` — read + create categories in one facet of `platform.categories`. See §"The canonical taxonomy".

### Service

- `features/scopes/service/scopesService.ts` — the **only** file allowed to call `supabase.from('ctx_*')`. ESLint rule enforces. All other code goes through Redux thunks or hooks.
- `features/scopes/service/associationsService.ts` — the **only** file allowed to call the `assoc_*` RPCs (`platform.associations`). Same chokepoint discipline.
- `features/scopes/service/categoriesService.ts` — the **only** file allowed to call the `cat_*` RPCs (`platform.categories`). Same chokepoint discipline.

### Slices

- `features/scopes/redux/scopesSlice.ts`
- `features/scopes/redux/contextValuesSlice.ts`
- `features/scopes/redux/templatesSlice.ts`
- `lib/redux/slices/appContextSlice.ts` (moved from `features/agent-context/redux/`)

---

## Component map

### Shared primitives (no Redux writes)

- `<ScopeTreeView />` — the rendering primitive both surfaces share. Pure presentation.
- `<ScopeIcon scope={...} />`
- `<ScopeChip scope={...} />`
- `<ScopeBreadcrumb path={...} />`

### Surface A — active context (writes `appContextSlice`)

Lives under `features/scopes/components/active-context/`. The only place allowed to import from `redux/active-context-actions.ts`.

- `<ActiveContextButton />` / `<ActiveContextPanel />` — primary Surface A controls for headers, toolbars, and tab panels. Multi-scope, single project, single task.
- `<ActiveScopeChips />` — header / chat composer pills.
- `<ActiveContextBreadcrumb />` — read-only display.
- `<ActiveContextLayersPanel />` — read-only display of every active layer (org / scope(s) / project / task). Per scope it renders its context items + current values (`useContextValues` + `scopesService.listContextItems`, the `ScopeDetailView` pattern); task uses the native `TaskEditor` (embedded/compact); org & project show a compact card + manage link. Pure read — never dispatches into `appContextSlice`. Rendered under the picker in the `RunControlsMenu` Context tab.
- `<ContradictionBanner entityType entityId />` — rendered at the top of any entity view where global vs local conflict.

### Surface B — entity tagging (never touches `appContextSlice`)

Lives under `features/scopes/components/pickers/`.

- `<EntityScopeTagger entityType entityId mode="managed" | "controlled" />` — M2M tagger.
  - `mode="managed"`: writes through to `platform.associations` (via `scopesService` `setEntityScopes` thunk) on confirm.
  - `mode="controlled"`: emits `(scopeIds) => void`, caller persists.
- `<EntityTargetPicker allow={['org' | 'project' | 'task' | 'scope']} onSelect />` — returns `{ kind, id }`. Always controlled.

### Manager (admin CRUD)

Lives under `features/scopes/components/manager/`.

- `<ScopeManagerLayout />` — admin shell.
- `<ScopeTypeList />` / `<ScopeTypeCard />` / `<ScopeTypeEditor />`
- `<ScopeList />` / `<ScopeCard />` / `<ScopeEditor />`
- `<ContextItemList />` / `<ContextItemEditor />` (columns defined on a scope type)

### Values

Lives under `features/scopes/components/values/`.

- `<ScopeValuesGrid scopeId />` — the spreadsheet view for one scope (rows = items, cells = values).
- `<ScopeValueField item={...} value={...} />` — the per-cell editor, type-aware.
- `<ScopeValueHistory itemId scopeId />` — version history.

### Templates

Lives under `features/scopes/components/templates/`.

- `<TemplateGallery />`
- `<TemplateDetail templateId />`
- `<ApplyTemplateFlow templateId orgId />`

### Associations panel (SHIPPED) + final scope-picker shape

The universal "link any entity to any entity" UI is **built**: `<EntityAssociator />` (see §"The unified association edge"). It is the canonical home for durable cross-entity relationships and reuses the scope-tree pickers rather than inventing new ones.

Still open: whether to merge the two **scope** pickers `<ActiveScopePicker />` (Surface A) and `<EntityScopeTagger />` (Surface B) into one configurable picker, or keep them split. The non-negotiable rule is the same for all three — **Surface B and association panels never write to `appContextSlice`**.

---

## Key flows

### Flow 1 — App boot

1. Auth ready → `ensureScopeTree({ refresh: false })` thunk fires (deferred, low-priority, after first interactive paint).
2. RPC: `get_user_scope_tree_with_projects` returns orgs → scope_types → scopes → projects.
3. `treeStatus: 'loading' → 'ready'`. Tasks NOT fetched. Orphan buckets all `unfetched`.
4. Surface A renders the sidebar with the populated tree.

### Flow 2 — User picks an active scope in the sidebar

1. User clicks "Client: Rejuvina" in `<ActiveScopePicker />`.
2. Dispatch `addActiveScope('rejuvina-id')`. The reducer replaces any existing scope of type `Client` in `scope_selections`.
3. If Rejuvina's org differs from the active org, dispatch `setActiveOrg(rejuvinaOrgId)` (cross-org cascade).
4. `selectActiveContext` recomputes. Every consumer subscribed to it re-renders.
5. Fire-and-forget `ensureTasksForLevel({ level: 'scope', id: 'rejuvina-id' })` to warm the tasks cache for Rejuvina.

### Flow 3 — User tags a note with a scope

1. User opens a note. Note view renders `<EntityScopeTagger entityType="note" entityId={noteId} mode="managed" />`.
2. User adds `Client: Rejuvina`. The component dispatches `setEntityScopes({ entityType: 'note', entityId: noteId, scopeIds: [...existing, 'rejuvina-id'] })`.
3. Thunk calls `scopesService.setEntityScopes` → `assoc_set_targets` makes the note's `scope` edges in `platform.associations` exactly equal the new set.
4. `appContextSlice` is **untouched**. The sidebar is **unchanged**.
5. If the user's global active context now contradicts the note's tags (different Client active globally), `<ContradictionBanner />` renders.

### Flow 4 — Locally-triggered agent action with resolution

1. User opens a note tagged with `Client: Rejuvina`.
2. Global active: `Client: Dr. Nazarian`, `Department: Content Writing`.
3. User triggers a context-menu agent on a selection.
4. Caller fetches `selectResolvedContext({ entityType: 'note', entityId: noteId })`.
5. Resolver: local `Rejuvina` wins on `Client`; global `Content Writing` flows through on `Department`.
6. ResolvedContext shipped to the Python backend as part of the invocation.
7. The contradiction is logged in the bundle's `contradictions: [{ typeId: clientTypeId, globalScopeId: drNazarian, localScopeId: rejuvina }]` field, surfaced to the agent if it cares.

### Flow 5 — Org admin applies a template

1. Admin opens `/scopes/templates`, picks "Healthcare Marketing", clicks Apply.
2. `<ApplyTemplateFlow />` dispatches `applyTemplate({ templateId, orgId })`.
3. Thunk calls `apply_template` RPC. Server inserts new `ctx_scope_types` + their `ctx_context_items` for the org.
4. On success, the tree slice is patched in place: new scope_types appended to the org node. No refetch.
5. UI redirects to `/scopes/manage` so the admin can name their first scopes.

### Flow 6 — Loading orphan projects

1. User scrolls to the bottom of an org's tree. `<ScopeTreeView />` renders the "Other projects" footer.
2. Footer state: `unfetched`. Renders a "Load others" button.
3. User clicks. Dispatch `loadOrphanProjects({ orgId })`. Status: `unfetched → loading`.
4. RPC: `list_orphan_projects(orgId, scope: 'no_scope')`.
5. Returns 0 → status `empty`, render "No others". Returns N → status `ready`, render the list.

---

## Invariants & gotchas

- **Global context is ONLY written by Surface A components** (`features/scopes/components/active-context/**`). Enforced, not just documented: `appContextWriteSyntaxRestrictions` (`eslint.config.mjs`, modeled on the scopesService chokepoint) bans importing the `appContextSlice` write actions (`setOrganization`/`setScopeSelections`/`setProject`/`setTask`/`setConversation`/`setFullContext`/`clearContext`) anywhere else. A legitimate Surface-A writer living outside that folder (`useHierarchyReduxBridge`, `useContextScope`, `BoundVariableChips`, `TasksContextSidebar`, the logout reset) carries a justified `// eslint-disable-next-line no-restricted-syntax`. Every other surface persists a durable association instead.
- **Association writes NEVER touch `appContextSlice`.** A durable `platform.associations` edge is a stored relationship, not the active working context. All edge writes go through `useAssociations` → `associationsService` → the `assoc_*` RPCs; new "tag / link X to Y" UI extends the edge, never a fresh M2M table or FK column.
- **One scope per scope_type in active context.** Multiple selections on the same type are rejected at the reducer (idempotent replace).
- **Across-type selection is fully additive.** Never silently clear other dimensions.
- **Cross-org snap is automatic and silent.** A scope from org B → active org becomes B. No confirm. Document it; never gate it.
- **No refetching unless the user clicks refresh.** Period.
- **Tasks are never in the root fetch.** Always lazy per-level.
- **Empty ≠ not-fetched.** Selectors and UI must distinguish.
- **Orphan buckets have their own lifecycle.** A populated tree does not imply orphans are loaded.
- **The contradiction warning is informational, not blocking.** Multi-scope-aware agents are valid.
- **All `ctx_*` Supabase calls go through `scopesService.ts`.** Boy-scout rule applies — fix violators on sight.
- **Templates are read-only catalog.** Mutations on `ctx_templates` happen elsewhere (seed scripts, admin-only).
- **`max_assignments_per_entity` is a hint, not a hard limit at the DB layer.** Surface B enforces in UI; the server validates in RPCs.
- **Personal organization is a real org row.** Personal workspace context uses the user's `organizations.is_personal = true` row and real org id. Do not synthesize or persist a fake personal org id in Redux, routes, RPC args, or association edges.
- **One entity vocabulary — `EntityType`.** Both `ctx_scope_assignments.entity_type` and `platform.associations.source_type` are free-text DB columns; the single `EntityType` union (`features/scopes/types.ts`) is the app-side guard that stops callers inventing tokens. There is NO separate `ScopeAssignmentEntityType` (deleted). New entity types are added to `platform.entity_types` FIRST, then mirrored into `EntityType` — never the reverse.

---

## Related features

- Depends on: `features/organizations/` (org primitive + invitations), `lib/redux/slices/appContextSlice.ts` (after the move).
- Depended on by: every Tier 1 feature that filters / tags / resolves by user-defined dimensions — `features/notes/`, `features/tasks/`, `features/projects/`, `features/agents/`, `features/agent-shortcuts/`, `features/agent-apps/`, `features/agent-context/`, `features/research/`, `features/conversation/`.
- Cross-links:
  - [`features/agent-context/FEATURE.md`](../agent-context/FEATURE.md) — the consumer that uses `selectResolvedContext` at invocation time. After the migration, agent-context is narrowly about broker-driven slot filling.
  - [`features/brokers/INFO.md`](../brokers/INFO.md) — the resolution layer below scopes. Broker key lookup is the mechanism; scopes are the data.
  - [`features/sharing/FEATURE.md`](../sharing/FEATURE.md) — orthogonal to scope. Permissions cross-cut.
  - [`features/scopes/docs/RPC_CONTRACTS.md`](docs/RPC_CONTRACTS.md) — the RPC surface this module owns.

---

## Doctrine compliance

> Required by [PRINCIPLES.md](../../PRINCIPLES.md). The artifact is disposable; the platform is the product.

**Primitives reused**

- Types: `Database["public"]["Tables"]["ctx_*"]["Row"]` from `types/database.types.ts` (source of truth, never re-declared).
- Components: `components/ui/*` (`Button`, `Card`, `Dialog`, `Skeleton`, `ScrollArea`, `Badge`, `Checkbox`, `Tabs`), `components/official/icons/IconResolver`, `components/dialogs/confirm/ConfirmDialogHost`.
- Redux slices / selectors: `appContextSlice` (moved to `lib/redux/slices/`).
- Hooks: `useAppSelector`, `useAppDispatch`, `useAppStore` from `lib/redux/hooks`.

**Primitives introduced**

- `scopesSlice` (`features/scopes/redux/scopesSlice.ts`) — Why a new slice: replaces 8 overlapping slices with one canonical tree. Considered extending: the existing `hierarchySlice` / `scopesSlice` pair. Rejected because: their shapes assume the dropped `workspaces` table and the old `ContextScopeLevel` string enum; they're load-bearing in the bug pattern we're killing.
- `contextValuesSlice` (`features/scopes/redux/contextValuesSlice.ts`) — Why a new slice: per-scope values have a fundamentally different lifecycle (high churn, optimistic edits, version history) from the tree. Considered extending: folding values into `scopesSlice`. Rejected because: bloats the tree slice and forces every tree consumer to subscribe to value churn.
- `templatesSlice` (`features/scopes/redux/templatesSlice.ts`) — Why a new slice: templates are a read-only catalog with a long TTL and an entirely different fetch cadence. Considered extending: folding into `scopesSlice`. Rejected because: same reasons as values.
- `<ActiveScopePicker />`, `<EntityScopeTagger />`, `<ScopeTreeView />` — Why new components: replace 14 overlapping pickers across `features/agent-context/components/`, `features/scope-system/components/`, and consumer features. Considered extending: the existing `ScopePicker`, `HierarchyCascade`, `HierarchyTree`, `ContextPickerPrimitives`. Rejected because: each was built on a different mental model and silently mutates global state. The cost of refactoring 14 components in place exceeds the cost of one clean replacement.
- `useResolvedContext()`, `useContradictions()` — Why new hooks: encode the resolution algorithm in one place so every consumer reads the same merged bundle. No existing hook returns the merged shape.

---

## Current work / migration state

**Phase 0 — Documentation** (current). This file plus `features/scopes/docs/RPC_CONTRACTS.md` plus updates to `features/agent-context/FEATURE.md`, `CLAUDE.md`, `AGENTS.md`. Stale planning docs deleted.

**Phase 0.5 — RPC contract design.** New RPC surface specified for the Python team. See `features/scopes/docs/RPC_CONTRACTS.md`.

**Phase 1 — Foundation** *(in progress)*. `features/scopes/` skeleton, slices (`scopesTree`, `contextValues`, `scopeTemplates`), `scopesService.ts` as the sole `ctx_*` chokepoint (ESLint-enforced), thunks (`ensureScopeTree`, `ensureScopeTasks`, `ensureOrphanProjects`, `ensureContextValues`, `ensureTemplates`, `setEntityScopes`) with strict no-refetch policy, selectors over the tree + active context + resolution + values + templates, public hooks (`useScopeTree`, `useActiveContext`, `useContextValues`, `useTemplates`). `appContextSlice` moved to `lib/redux/slices/`. Deferred `ensureScopeTree` wired into `app/DeferredSingletons.tsx` (priority 2). No consumer changes yet — old slices still mounted; old idle task still firing. ESLint allowlist covers existing `ctx_*` callers as a Phase-5 retirement queue; new code must go through `scopesService`.

**Phase 2 — Surface A** *(completed)*. `<ActiveScopePicker />`, `<ActiveScopeChips />`, `<ContradictionBanner />` shipped under `features/scopes/components/active-context/`. The Surface A invariant is enforced at the import layer: only this directory dispatches `setOrganization` / `setScopeSelections` / `setProject` / `setTask` against `appContextSlice`. `DirectContextSelection.tsx` reduced to a 17-line shim that re-renders `<ActiveScopePicker />` so the four call sites (shell Sidebar, NoteSidebar, MobileNotesView, ChatSidebar) swap in one shot. The `fetch-full-context` idle task removed from `app/DeferredSingletons.tsx` — `ensureScopeTree` is now the only boot-time scope fetch; legacy hierarchy consumers self-fetch via `useNavTree()` when needed.

**Phase 3 — Surface B** *(completed)*. Shipped under `features/scopes/components/entity-context/`:

- `<EntityScopeTagger />` — M2M scope tagging with two modes:
  - **Uncontrolled** (`entityType` + `entityId`): self-fetches assignments via `useEntityScopes`, persists changes through `setEntityScopes`. The component owns the full read/write cycle.
  - **Controlled** (`value` + `onChange`): no `ctx_*` writes; caller wires the result to its own slice (used by `TaskScopeFilter` to populate `taskUiSlice.filterScopeIds`).
- `<EntityTargetPicker />` — pure FK picker over orgs / projects / tasks. Reads the scope tree, lazy-fetches the per-level task bucket and orphan-project bucket, and reports `(id, displayName, sideEffects?)` to the caller. Never touches `ctx_*` tables or `appContextSlice`. Cascade-project-on-task-pick is opt-in via `cascadeProjectOnSelect`.
- Plumbing added to support Surface B: `entityScopesByKey` substate on `scopesTree`, `getEntityScopes` chokepoint method, `ensureEntityScopes` thunk (no-refetch + per-key in-flight dedup), `setEntityScopes` thunk now updates the cache authoritatively after a successful write, `makeSelectEntityScopes` / `makeSelectEntityScopeIds` selectors, and the `useEntityScopes` hook (auto-fetches on mount, exposes `{ scopeIds, status, error, setScopes, refresh }`).

Migrated consumers:

- `features/notes/components/NoteContextPicker.tsx` — fully reworked. Org / project / task pickers are `<EntityTargetPicker />`; scope row is `<EntityScopeTagger />`. The picker no longer fetches scope types, scopes, or assignments directly — all of that is the new module's responsibility. Note-record FK writes (`setNoteField`) stay in the notes slice, exactly as before.
- `features/tasks/components/TaskScopeFilter.tsx` — fully reworked. Uses `<EntityScopeTagger />` in controlled mode, with `taskUiSlice.filterScopeIds` as the backing store. The legacy `EMPTY_SCOPE_PICKER_OPTIONS` / `selectScopePickerOptions` / `fetchScopeTypes` / `fetchScopes` imports are gone. `ActiveScopeFilterChips` now reads scope-type metadata directly from the canonical tree.

After Phase 3 ships, decide whether Surface A and Surface B should share a single configurable picker. The codepath difference (one writes `appContextSlice`, the other writes `ctx_scope_assignments` or a controlled-mode callback) is enforced at the component boundary, so a shared inner UI primitive is plausible — but premature today.

**Phase 4 — Manager + values + templates routes** *(completed)*. The canonical `/scopes` route tree now lives under `app/(a)/scopes/`:

- `/scopes` — `<ScopesHub />` lists every org you belong to with scope-type chips, scope counts, and quick-links into Manage, Templates, and the legacy per-org route.
- `/scopes/manage` — `<ScopesManager />` deeplinks via `?org=<id>` (defaults to the active org). Renders the org's scope types as collapsible cards, each with their scopes linked into the detail view.
- `/scopes/[scopeId]` — `<ScopeDetailView />` shows the scope's owning type, parent org, description, default variable keys, and the current context-item values via `useContextValues`. Editing values still routes out to the legacy editor pending Phase-5 chokepoint writes.
- `/scopes/templates` — `<TemplatesGalleryPanel />` reads `useTemplates`, groups by category, and offers "Apply to <active org>" links that route to the legacy applier.
- `/scopes/settings` — `<ScopesSettingsPanel />` exposes tree diagnostics (status, organization count, fetched-at) with a manual refresh, plus quick-links to each org's settings/scopes page.

`app/(a)/organizations/[orgId]/scopes/page.tsx` is now a thin wrapper that resolves the slug-or-id and renders `<ScopesManager orgIdOverride={orgId} />`. The legacy `<ScopesGrid />` and its associated direct-`ctx_*`-reads remain in `features/scope-system/` only because the nested `[typeId]/[scopeId]/page.tsx` editors haven't been migrated yet — Phase 5 deletes that whole tree.

**Phase 5 — Consumer migration + teardown** *(in progress)*. Phase 5 is the multi-week teardown after every chokepoint mutation method has shipped on the Python side (see `features/scopes/docs/RPC_CONTRACTS.md`). The Phase-5 turn migrated every read-path consumer that doesn't need a new mutation chokepoint:

- `features/tasks/components/TaskScopeTags.tsx` — `useEntityScopes` + `useScopeTree`.
- `features/notes/components/{NoteSidebar,NotesView,mobile/MobileNotesList}.tsx` — `useEntitiesByScopes` for reverse-indexed sidebar grouping; `ensureScopeTree` for boot/refresh.
- `features/tasks/components/{TaskListPane,TaskPreviewWindow,TasksContextSidebar}.tsx`, `features/tasks/widgets/quick-create/TaskQuickCreateCore.tsx` — swapped legacy `selectAllScopes` / `selectAllScopeTypes` / `selectScopeNameMap` for the new tree-flattening selectors (`selectAllScopesFlat`, `selectAllScopeTypesFlat`, `makeSelectScopeNameMapForOrg`).
- `features/tasks/redux/{selectors,thunks}.ts` — `selectTaskIdsMatchingScopeFilter` / `selectTaskIdsMatchingAppContextScopes` / `selectGroupedFilteredTasks` now compose `makeSelectEntityIdsMatchingScopes` + `selectAllEntityScopeAssignmentsFlat` from the canonical tree slice. `createTaskThunk` writes scope assignments through the new module's `setEntityScopes` thunk. The legacy `selectAllAssignments` cache (entity-adapter slice populated on-demand) is replaced with `entityScopesByKey` (per-key cache populated by `ensureEntityScopes`); behaviour is intentionally identical because both grow lazily as taggers open.
- `features/surfaces/components/AgentSurfacesPanel.tsx` — `BindingRow` reads via `useEntityScopes`, `BindingEditorDialog` hydrates with `useEntityScopes` and persists with the new `setEntityScopes` thunk, `CustomScopeSection` deleted entirely (`<EntityScopeTagger variant="compact" allowMultiPerType />` in controlled mode replaces it). `agent_surface_binding` added to the `ScopeAssignmentEntityType` union.
- `features/agent-apps/components/inputs/AgentAppHierarchyCascade.tsx` — `useEntityScopes` for read + write; `selectAllScopesFlat` powers the type-derived `{typeId → scopeId}` shape consumed by `HierarchyCascade`.
- Two new module selectors added to support the migration: `makeSelectEntityIdsMatchingScopes` (reverse-index helper that walks `entityScopesByKey`) and `selectAllEntityScopeAssignmentsFlat` (flat-tuple view matching the shape the legacy `selectAllAssignments` returned). `useEntityScopes` now exposes `status` / `error` / `fetchedAt` on top of `setScopes` / `refresh`, which `BindingEditorDialog` relies on for its hydration spinner.
- `/scopes` added to `features/shell/constants/nav-data.ts` and `constants/favicon-route-data.ts` as a top-level entry alongside the legacy "Context" (`/agent-context`). Both routes coexist during the migration.
- ESLint chokepoint allowlist re-audited. Nothing migrated in Phase 5 was on the allowlist (every Phase-5 consumer was already going through Redux/hook indirection, never directly to `ctx_*`). The allowlist still covers the surfaces in the §"Retirement inventory" — they shrink with Phase-5 wholesale deletes, not by individual consumer migration.

**What remains** (Phase 5 backlog — sized at the file level):

1. **Read-path consumers** (still legacy-coupled):
   - `features/agent-context/components/hierarchy-selection/HierarchyHoverMenu.tsx` — partial; uses `createScope` which is a chokepoint stub (see below)

2. **Mutation-heavy consumers** (blocked only on FE work — the DB RPCs already exist and are live):
   - The required RPCs (`create_scope_type`, `update_scope_type`, `delete_scope_type`, `create_scope`, `update_scope`, `delete_scope`, `create_context_item`, `apply_template`, `set_scope_context_value`) ship in the DB today and are called directly by the legacy editors' thunks (`features/agent-context/redux/scope/*`, `features/scope-system/redux/*`). Filling the `scopesService` stubs is a mechanical swap modeled on `setContextValue` / `setEntityScopes` (both already RPC-backed in the chokepoint). Only `update_context_item` / `delete_context_item` lack an RPC (legacy does direct `ctx_context_items` writes); `revert_context_value` / `delete_context_value` have neither RPC nor UI.
   - `features/scope-system/components/**` — the whole legacy CRUD editor surface. Replacements should live under `features/scopes/components/management/` alongside the existing read views. Until then, the new `scopesSlice` mirrors the legacy mutation thunks via string-matched `extraReducers` (see "Legacy mutation mirroring" in `scopesSlice.ts`) so the canonical tree never goes stale behind a legacy edit.
   - `app/(a)/organizations/[orgId]/scopes/[typeId]/{page,[scopeId]/page}.tsx` — wrap or rewrite once the editor sheets above are migrated.
   - `app/(a)/agent-context/items/**`, `app/(a)/agent-context/templates/page.tsx` — context-item CRUD and template application; same chokepoint dependency.

3. **Hierarchy slice (`hierarchySlice` / `hierarchyThunks` / `projectsSlice` / `tasksSlice` / `organizationsSlice`)** — these continue to power non-scope UIs (task lists, project pickers, etc.). The new `scopesTree` slice now carries projects + scope-tree but does **not** yet expose the full task/note hierarchy (task search, mobile nav tree, etc.). Two paths from here:
   - **(A)** extend `scopesTree` to be the single hierarchy source of truth and migrate hierarchy consumers; or
   - **(B)** keep the hierarchy slice scoped to `features/agent-context` and explicitly stop calling it "context" — rename it to `features/hierarchy/` (or similar) and let it own the org→project→task fan-out without scope semantics.

   Either path is reasonable. Until one is chosen, the hierarchy slice stays where it is.

4. **Final teardown** (only safe after #1 and #2 above are 100% done):
   - Delete `features/agent-context/redux/scope/` (4 slices + selectors + types).
   - Delete `features/scope-system/` entirely.
   - Delete `app/(a)/agent-context/` (add a `redirect` shim from `/agent-context` → `/scopes`).
   - Remove the eight legacy reducers from `lib/redux/rootReducer.ts` and rename `scopesTree` → `scopes` / `scopeTemplates` → `templates`.
   - Shrink the ESLint chokepoint allowlist in `eslint.config.mjs` to just `features/scopes/service/scopesService.ts`.
   - Remove the "Context" entry from `features/shell/constants/nav-data.ts`.

The migration order is fixed: chokepoint writes ship → mutation-heavy consumers swap → read-path consumers swap (these can happen in parallel with the chokepoint work) → final teardown. The current ESLint allowlist makes Phase 5 a "shrinkage" process — each migrated file gets removed from the allowlist; the build can't regress.

### Retirement inventory (Phase 5 delete list)

**Wholesale deletes:**

- `features/agent-context/redux/scope/` — 4 slices + selectors + types
- `features/agent-context/redux/hierarchySlice.ts`, `hierarchyThunks.ts`
- `features/agent-context/redux/organizationsSlice.ts`, `projectsSlice.ts`, `tasksSlice.ts` — move to owning feature folders if any logic remains, otherwise delete
- `features/agent-context/service/contextService.ts`, `hierarchyService.ts`
- `features/agent-context/hooks/useContextItems.ts`, `useContextScope.ts`, `useNavTree.ts`, `useHierarchy.ts`, `useContextFilters.ts`, `useContextKeyboard.ts`, `useScopeAssignment.ts`
- `features/agent-context/components/*` — all ~22 top-level components plus `hierarchy-selection/`, `scope-admin/`, `hub/` subfolders
- `features/scope-system/` — entire folder
- `app/(a)/agent-context/` — entire route (add a redirect to `/scopes`)
- `lib/redux/rootReducer.ts` — drop 8 reducers, add 3 (`scopes`, `contextValues`, `templates`)

**Surgical consumer migrations:**

- `features/notes/redux/thunks.ts` — DONE: `fetchAllNoteScopes` now calls `scopesService.listEntityScopeTags("note")` (no direct `ctx_scope_assignments` / `ctx_scopes` access)
- `features/notes/components/NoteSidebar.tsx`, `NotesView.tsx`, `mobile/MobileNotesList.tsx`
- `features/tasks/components/TaskScopeTags.tsx`, `TaskScopeFilter.tsx`, `TasksContextSidebar.tsx`, `TaskListPane.tsx`, `TaskPreviewWindow.tsx`
- `features/tasks/widgets/quick-create/TaskQuickCreateCore.tsx`
- `features/tasks/redux/{selectors,thunks}.ts`
- `features/projects/{service.ts,hooks.ts}`
- `features/research/components/{init,overview,settings}/*`
- `features/surfaces/components/AgentSurfacesPanel.tsx`
- `features/agent-apps/components/inputs/AgentAppHierarchyCascade.tsx`
- `features/shell/components/sidebar/Sidebar.tsx` (no inline context picker — use header/run surfaces)
- `lib/api/call-api.ts` — verify it only reads `appContext` from the new location

---

## Change log

- `2026-06-29` — cursor: **Association vocabulary made type-safe + the edge handler hardened.** (1) **Generated entity-token vocabulary:** `types/generated/entity-types.generated.ts` (216 tokens) is now produced by `scripts/generate-entity-types.ts` from `platform.entity_types` via a new public SECURITY-DEFINER RPC `entity_types_list()` (`migrations/entity_types_list_rpc.sql`, applied + ledgered). Exposes `EntityTypeToken` (full FK-valid union), `isEntityTypeToken`, `ENTITY_TYPE_TOKENS`, `ENTITY_TYPE_METADATA`, curated subsets. Wired into `pnpm gen:entity-types` / `pnpm check:entity-types` (drift) / `pnpm sync-types`. `features/scopes/types.ts` re-exports them; `AssociationTargetType` is now a curated list proven valid with `satisfies readonly EntityTypeToken[]`. (2) **Handler guards:** `service/associationGuards.ts` (`checkToken`/`checkUuid`/`checkUuidArray`) run in EVERY `associationsService` method before the RPC — a bad token or non-UUID id becomes a loud `invalid_argument` result, not an opaque PG `22P02`/`23503`. Kills the "agent passed a cute string id" + "guessed token" bug classes. (3) **Typed composite wrappers:** `service/associationHelpers.ts` (`linkEdges`/`linkOneToMany`/`linkManyToOne`/`replaceTargets`/`linkCreated`/`unlinkEdges`). (4) **Graveyarded the two buggy task RPCs** `create_task_with_association` + `associate_with_task` (`migrations/graveyard_buggy_task_assoc_rpcs.sql`, applied + ledgered) — both hand-rolled a 4-column ON CONFLICT that matched no unique index (the real key is the 5-tuple incl. `role`) → 42P10. `taskAssociationsSlice` thunks now insert the task then wire edges through the chokepoint; `get_task_associations` kept. **Open hole flagged:** phantom tokens `agent_app`/`cx_message`/`cx_conversation`/`user_file`/`chat_block` (used in code, not registered) — see KNOWN_DEFECTS; cleanup-hunt pending.
- `2026-06-26` — cursor: **ctx_* tables moved to `context` schema** — `scopesService` (and all other FE chokepoints) now reach `context.scope_types` / `context.scopes` / `context.context_items` / etc. via `contextDb(supabase)` (mirror of `workspaceDb`). `pnpm db-types` includes `--schema context`; generated row aliases in `features/scopes/types.ts` point at `Database["context"]["Tables"]`.
- `2026-06-26` — claude: doc cutover — replaced the remaining "Local context is stored via `ctx_scope_assignments`" descriptions (Local-context definition, the invariant, the data-model tree, the resolution-flow diagram, `EntityScopeTagger` managed mode) with the canonical truth: scope tags live in `platform.associations` (table graveyarded), reached via `scopesService`/`associationsService`. Code-side cleanup: deleted the dead `scopeContextSlice` (0 importers) + its `rootReducer` registration; repointed `ScopeAssignmentRow` (`features/scopes/types.ts`) from the soon-to-vanish generated `ctx_scope_assignments` row to a hand-written interface.
- `2026-06-25` — claude: **Task associations cut over to `platform.associations`; `ctx_project_members` RLS repointed to `iam.memberships`.** (1) The 6 task-assoc RPCs (`get_task_associations`/`get_tasks_for_entity`/`associate_with_task`/`dissociate_from_task`/`create_task_with_association`/`create_tasks_bulk`) now read/write the edge — `migrations/task_associations_canonical_repoint.sql` (applied + ledgered), including a **backfill** of the 13 legacy rows that were never mirrored. Direction is **content=source → target=`task`** (the `target_type` CHECK forbids entity types as targets — a task's note/file/artifact links are `source=<entity> → target=task`; a task's own scope/project tags stay `source=task → target=scope`). RPC shapes unchanged → FE (`taskAssociationsSlice`, `AssociateTaskButton`, canvas `TasksArtifact`, `TaskChecklist`) untouched. Task attachments now also use the edge (file=source, task=target). (2) **RLS correctness:** 13 policies on live tables still subqueried `ctx_project_members` (now stale — membership edits flow only to `iam.memberships`); repointed via the new `public.user_container_ids(container_type, role_filter[])` SECURITY-DEFINER helper (must be in `public`, not `iam` — RLS runs as the invoker and `authenticated` has no `iam` schema USAGE) — `migrations/repoint_project_member_rls_to_iam.sql`. See `docs/db_rebuild/canonical-cutover-plan.md` for the full cutover status.
- `2026-06-26` — codex: removed the old Personal pseudo-org sentinel contract from scope docs and tree comments. Scope/project grouping now treats the user's personal workspace as a real `organizations.is_personal` org row.
- `2026-06-25` — claude: **Frontend fully off `ctx_scope_assignments` + batch source RPC shipped.** (1) **New `assoc_for_sources(p_source_type, p_source_ids[], p_target_type?)` RPC** (`migrations/assoc_for_sources_rpc.sql`, applied + ledger-recorded; SECURITY DEFINER, org-gated, target-filtered in the DB) — the batch-by-SOURCE counterpart of `assoc_for_targets`. Wired as `associationsService.listForSources`; `scopesService.bulkEntityScopeIds` now does ONE round-trip for N entities instead of N `assoc_for_entity` calls (kills the regression noted below). NOTE: the live `platform.associations` column is `organization_id` (the older repo `assoc_*` migration files drifted to `org_id`); the new RPC matches live. (2) **Last frontend consumers migrated off the table:** `scopeAssignmentsSlice` thunks now flow through `scopesService` (no more `get_entity_scopes`/`set_entity_scopes`/`list_entities_by_scopes`); `notes/thunks.ts#fetchAllNoteScopes` → new `scopesService.listEntityScopeTags`; `AssignedScopesDisplay` → new `scopesService.getEntityScopeDetails`; `ProjectsHub` ?scope filter → `scopesService.listEntitiesByScopes`. New chokepoint methods `getEntityScopeDetails` / `listEntityScopeTags` (+ `ScopeWithType`/`EntityScopeTag` types) keep the ctx_scopes⋈ctx_scope_types join inside the chokepoint. **No app code references `ctx_scope_assignments` or its RPCs any more** — only DB-side functions remain (see next steps to drop the table).

- `2026-06-25` — claude: **`scopesService` scope assignments cut over from `ctx_scope_assignments` → `platform.associations`.** A scope tag is now the unified edge `source=(entityType, entityId) → target=('scope', scopeId)`; the service no longer touches `ctx_scope_assignments` at all and delegates every assignment read/write to `associationsService`. Reads: `getEntityScopes`/`bulkEntityScopeIds`/tags use `assoc_for_entity` (outgoing `scope` edges); `listEntitiesByScopes`, `getScopeTree`'s project→scope map, and `listScopeTasks`(scope-level) use `assoc_for_targets('scope', …)` (incoming edges, source-filtered). Writes: `setEntityScopes` now calls `assoc_set_targets` (replaces the legacy `set_entity_scopes` RPC) and echoes the deduped input as the post-state. **Two notes:** (1) `assoc_set_targets` does NOT enforce `max_assignments_per_entity` — the cap the old RPC checked is dropped until pushed into the assoc layer. (2) **LOUD GAP:** there is no batch-by-SOURCE assoc RPC (`assoc_for_targets` is batch-by-target only), so `bulkEntityScopeIds` fans out one `assoc_for_entity` per entity — list surfaces pay N round-trips until a batch `assoc_for_sources` RPC exists. Remaining direct `ctx_scope_assignments` consumers (legacy `scopeAssignmentsSlice`, notes thunk) still to migrate before the table is dropped.

- `2026-06-24` — claude: **`appContextSlice` writes ESLint-enforced + entity vocabulary unified.** (1) The "global context is written by Surface A ONLY" invariant is now enforced, not just convention: `appContextWriteSyntaxRestrictions` (`eslint.config.mjs`, modeled on the scopesService chokepoint) bans importing the slice's write actions (`setOrganization`/`setScopeSelections`/`setProject`/`setTask`/`setConversation`/`setFullContext`/`clearContext`) outside `features/scopes/components/active-context/**` (+ the slice file). The 5 legitimate Surface-A writers outside that folder carry a justified `eslint-disable-next-line` (`useHierarchyReduxBridge`, `useContextScope`, `BoundVariableChips`, `TasksContextSidebar`, `AuthSessionWatcher`); none were the durable-association anti-pattern. (2) **One entity vocabulary:** deleted the divergent `ScopeAssignmentEntityType`; all ~17 callsites use the canonical `EntityType`, now 15 registry tokens + 3 app entity types (`agent_app`/`agent_surface_binding`/`page_extraction_job`), dead `agent_shortcut`/`project_resource` dropped. Registry parity: `migrations/platform_entity_types_app_tokens.sql` (registers the 3 in `platform.entity_types`).

- `2026-06-24` — claude: **The unified association edge shipped** — `platform.associations` (one polymorphic `source→target` table, target CHECK-constrained to 8 tokens, driven by `platform.entity_types`/15) replaces scattered `project_id`/`task_id` FK tagging + per-feature M2M tables. New FE primitive under `features/scopes/`: `service/associationsService.ts` (sole `assoc_*` chokepoint), `hooks/useAssociations`, `components/associations/EntityAssociator.tsx`, `scopesSlice.associationsByKey` + `redux/thunks/selectors/associations`, plus `EntityType`/`AssociationTargetType`/`AssociationEdge`/`AssociationsEntry` in `types.ts`. FE data path = four PUBLIC SECURITY-DEFINER RPCs (`assoc_for_entity`/`assoc_add`/`assoc_remove`/`assoc_set_targets` — `authenticated` has no direct `platform.*` grant); migrations `assoc_public_rpcs.sql` + `assoc_m2m_mirror_triggers.sql`. **Transition contract:** old M2M tables + FK columns are MIRRORED into the edge by triggers (33 FK + 2 M2M via `_mirror_m2m_to_assoc`), so reads can move now; drops are a later destructive wave. War Room writes the edge directly. `ContextAssignmentField`'s project/task tagging now persists real edges via `setTargets` (was a dead stub). **Invariant:** association thunks never write `appContextSlice`. New §"The unified association edge"; reconciled the "final picker shape — deferred" note (relationship UI is now `EntityAssociator`). Also this changeover (FE swap pending, documented at the consuming features): `platform.user_entity_state` (favorites/pins/hidden/recency; RPCs `ues_set`/`ues_list`/`ues_get_bulk`/`ues_touch`) and `platform.categories` (faceted by `dimension`; RPCs `cat_list`/`cat_create`; assignment reuses `assoc_add(target_type='category')`).

- `2026-06-19` — claude: **`ActiveContextLayersPanel`** — read-only display of the selected context (`active-context/ActiveContextLayersPanel.tsx`). For each active scope it shows the scope's context items + current values (reuses the `ScopeDetailView` data pattern: `useContextValues` + `scopesService.listContextItems`); org/project render a compact card with a manage link; a selected task embeds the native `TaskEditor`. Pure Surface-A read (no dispatch). Wired into the `RunControlsMenu` Context tab beneath `ActiveContextPanel` (picker `sectionHeight` trimmed to 220, tab now scrolls). Closes the gap where selected context layers showed nothing of what they carried.

- `2026-06-18` — claude: **Org home folded into the universal header.** `ScopesRouteHeader` now also renders on the org home itself (`/organizations/[orgId]`, `segs.length === 0`): ← · Organizations icon · **Company** with the org switcher, and the same Edit / Delete tap-target group in the header-right slot — Edit → `/organizations/[orgId]/settings`, Delete → guarded `confirm()` + `deleteOrganization` (owner-only, non-personal, redirects to `/organizations`; the type-the-name danger zone in settings still exists). `OrgWorkspace` switched to `h-dvh` + `px-* pt-12 pb-12` and dropped its inline Back + "Manage" buttons (now header actions); "Contribute" stays inline.
- `2026-06-18` — claude: **Universal header for the whole Scope & Context route family.** `ScopesRouteHeader` (`features/scope-system/components/ScopesRouteHeader.tsx`) is now the single layout-level breadcrumb + action primitive for the entire subtree, mounted once at `app/(core)/organizations/[orgId]/layout.tsx` and self-gating by pathname (renders only on `/scopes/**` and `/context-items`; null everywhere else under `[orgId]`). It builds the full-path breadcrumb (← · Organizations icon · Org switcher · Scopes · type · scope/context-item · …) with per-level sibling dropdowns + an iPhone-style mobile drawer, plus the unified Hub/Edit/Delete tap-target action group in the header-right slot — for every level: scopes hub, scope type (list), type edit, type context-items (hub/item/item-edit), the scope family (detail/edit/context-items/value), and org-level context-items. Deleted the old per-route `[scopeId]/layout.tsx`. Stripped the now-duplicate inline `<ScopeBreadcrumb>` + oversized "Edit settings"/"Edit item"/"Open hub" buttons + asymmetric `pr-14` from `ScopesList`, `ScopeTypeEditView`, `ContextItemsHub` (type + org views), `ContextItemHub`, `ContextItemEditView`, and `ScopesManager` (quick-edit drawers kept). Every page wrapper switched to `h-dvh` + `px-* pt-12 pb-12` (the shell main extends behind the transparent header — nothing to subtract). `<ScopeBreadcrumb>` is now consumed only by `ScopesRouteHeader`.
- `2026-06-16` — claude: **Tasks wired to canonical context field.** `TaskContextSection` (`features/tasks/components/TaskContextSection.tsx`) — assignment mode, `dimensions={["scopes","projects"]}` (no nested task FK). Consumed on `/tasks`, `/tasks/[id]`, and mobile task detail; sidebar filter uses `mode="filter"` + scopes only.
- `2026-06-16` — claude: **`ContextAssignmentField.dimensions`.** New optional `dimensions?: ("scopes" | "projects" | "tasks")[]` (default: all three) hides Projects/Tasks sections, skips their engagement fetch, and adjusts search/footer/suggestions. Project settings uses `dimensions={["scopes"]}` for pure scope tagging.
- `2026-06-16` — claude: **Project settings scopes → canonical `ContextAssignmentField`.** `/projects/[projectId]/settings` swapped `<EntityScopeTagger variant="dropdown" />` for `<ContextAssignmentField mode="assignment" />` (same pattern as `NoteContextSection`) so users get inline quick-add, scope edit, search, and explicit Save — the dropdown tagger had no create path. New shared host `components/matrx/resizable/MatrxDynamicPanelHost.tsx` wraps `MatrxDynamicPanel` with open/close, title, Escape dismiss, header actions, and a close button. Replaced blocking `Sheet` chrome on scope-type / scope / context-item editors: `EditScopeTypeSheet`, `EditContextItemSheet`, `EditScopeValueSheet`, `AddScopeModal`, `TemplateGalleryDrawer`, `ScopeTypeFormSheet`, `ScopeFormSheet`, and `ScopeTemplateStarter`'s template picker. Panels are non-blocking, drag-resizable, and repositionable (left/right/top/bottom) on desktop.
- `2026-06-15` — claude: **`EntityScopeTagger` writes are now optimistic + serialized (fixes "scopes don't save").** Two defects made tagging feel broken on the project settings page (and every uncontrolled tagger): (1) `selected` read only persisted Redux state, so a dropdown/chip snapped back to its old value (e.g. "None") for the entire `set_entity_scopes` RPC round-trip — looked like the write was lost even though the DB always committed; (2) the in-flight guard `if (saving) return;` **silently dropped** every selection made while a previous write was pending, so rapidly tagging several scope types persisted only the first. Replaced with an optimistic overlay (`optimistic` state shows the user's choice instantly) and a serialized write pump (`writingRef` + `queuedRef`) that **coalesces** the latest full selection instead of dropping it — every write sends the complete current set, so no stale-baseline clobber. Failure reverts the overlay and toasts. Controlled/filter mode unchanged. Persistence path (RPC chokepoint, no `appContextSlice` writes) untouched.
- `2026-06-14` — claude: **Mobile bottom-sheet for every context surface.** New `ContextSheet` (`context-assignment/ContextSheet.tsx`, built on the official `BottomSheet` primitive) is THE mobile host. Every wrapper — `ContextAssignmentPopover`, `ContextAssignmentDialog`, `ContextAssignmentWindow`, `UploadContextPrompt`, `ActiveContextButton` — now switches to `ContextSheet` on `useIsMobile()` instead of a too-wide desktop popover/dialog/draggable window. `ContextAssignmentField` gained a **`fill`** prop (and `ActiveContextPanel` passes it through): the card becomes a flex column, its section list is the single scroll area, and the footer pins — no nested scrolling inside the sheet. The field's org-of-record + search row now stacks (`flex-col sm:flex-row`, org select `w-full sm:w-[260px]`) so it never overflows a phone. Desktop behaviour unchanged.
- `2026-06-13` — claude: **Active-mode quick-add parity.** `HierarchyTree` (active/filter modes) now exposes per-type scope quick-add (`New` + inline create via `createScope`), matching assignment-mode sections. Live project quick-add wired through canonical `features/projects/service.createProject` (was preview-only / console.warn). All wrappers (`ActiveContextButton`, `ActiveContextPanel`, `ContextAssignmentPopover`, etc.) inherit the fix via `ContextAssignmentField`.
- `2026-06-13` — claude: **`ContextAssignmentField` "All organizations" default.** Assignment-mode org dropdown gained a top **"All organizations"** option (sentinel `ALL_ORGS`) that filters nothing — scope-type sections render grouped per org (org header shown only in All mode), and projects/tasks/suggestions span every org. **All is now the default** unless a surface passes `defaultOrganizationId` (the old active-org → richest-org auto-pick is gone). Selecting All sets `selection.organizationId = null` (no org adoption); per-section inline quick-add passes the section's own org id. Surfaces that "enforce" an org keep doing so via `defaultOrganizationId`.
- `2026-06-12` — claude: **Removed sidebar context menu** — deleted `DirectContextSelection` shim and `ActiveScopePicker` (inline sidebar picker). Unwired from shell `Sidebar`, `NoteSidebar`, `MobileNotesView`, and public `ChatSidebar`. Active context is now set only via `ActiveContextButton` / `ActiveContextPanel` / `ContextAssignmentField mode="active"` on intentional surfaces (chat header, run controls, etc.). Removed `styles/shell.css` twin-render rules.
- `2026-06-12` — claude: **`ActiveContextPanel`** — inline Surface-A editor (`active-context/ActiveContextPanel.tsx`): same field + `appContextSlice` dispatch as `ActiveContextButton` without trigger chrome. `ActiveContextButton` now composes it inside its popover. Wired into `RunControlsMenu` Context tab (standard checkboxes, `sectionHeight=280`).
- `2026-06-12` — claude: **`ContextSelectionSummary`** — labeled active/filter footer in `ContextAssignmentField` (Org · Scope Types group dimension · per-type scope rows · Projects · Tasks). Scope-type group selection (`selScopeTypeIds`) is wired for display; UI for whole-type picks is the next round.
- `2026-06-12` — claude: **active context is live-apply** — `ContextAssignmentField` `mode="active"` calls `onApplyActive` on every selection change (skips mount hydration); removed the Set-context footer button. `ActiveContextButton` popover stays open while editing.
- `2026-06-12` — claude: **`ClearContextButton`** — canonical rose + Eraser control with "Clear Context" label (`active-context/ClearContextButton.tsx` + `clear-context-styles.ts`); dispatches `clearContext` via new `selectHasActiveContext`. Wired into `ActiveContextButton` (beside non-icon triggers), `ActiveScopePicker` (collapsed header + expanded footer), and `ContextAssignmentField` active-mode footer (`onClearActive` host hook). Context lab Block 1.6 demos it.
- `2026-06-12` — claude: **hierarchical tree + true multi-scope active context + agent handoff.** (1) `ContextAssignmentField` active/filter modes replaced the double-org UI (browse dropdown + Organization section — the `/chat/new` bug) with ONE hierarchical org→type→scope tree (org row: chevron expands, checkbox = explicit org opt-in; slight indents; search auto-expands); fixes every `ActiveContextButton` surface at once. (2) **Active context is now true multi-scope**: `appContextSlice.scope_selections` is keyed by SCOPE id (map type unchanged; one-per-type cardinality is GONE — do not reintroduce); `ActiveScopeChips` resolves type from the scope; `ActiveContextButton` applies keyed-by-scope-id. (3) Sidebar `ActiveScopePicker`: multi-select per type ("N selected" + multi-check flyouts via new `selectedIds` on `ContextRow`/`SearchableList`); unreadable `/40`–`/60` text (Clear context, Load other projects) bumped to readable; collapsed shell rail now swaps to an icon-only `ActiveContextButton` popover (`DirectContextSelection` twin render + `styles/shell.css`). (4) **Agent enablement:** new `context-assignment` skill (`.claude/skills/context-assignment/SKILL.md` — component-selection table, membership mental model, active-vs-durable, fetch/write rules) + handoff doc `docs/ctx/CONTEXT_ROLLOUT_HANDOFF.md` (state, surfaces, gaps, commit trail).
- `2026-06-11` — claude: **app-wide rollout of the official ContextAssignment set** (CANONICAL — extend these, never fork: `context-assignment/` = `ContextAssignmentField` (modes assignment/active/**filter**) + Popover/Dialog/Window wrappers + `ContextSummaryChips` + `ContextStatusButton` + `UploadContextPrompt` + `data.ts` caches; `active-context/ActiveContextButton` = the compact Surface-A control). Field gained: `filter` mode (multi-select, no save/create, live emission, zero save-side effects), **explicit-org semantics** for active/filter (org is opt-in; a scope NEVER implies its org), optional subject, `initialSelection`, `onSubmitSelection`. New `scopesService.getEntityScopesBulk` + row-scope store (`primeEntityScopes`/`setRowScopes`) so list surfaces show per-row status with ONE query per page. **Surfaces wired:** files (UploadContextPrompt on upload start w/ fast/slow race handling; table "Context" column ON by default; Info tab un-gated — replaced org-gated `EntityScopeTagger` use; PDF-extractor toolbar chip on the underlying cld_file; RAG data-stores header), sidebar `ActiveScopePicker` (projects/tasks no longer gated behind an org — falls back to full cached lists), `/chat` header (xs button beside agent picker; execute-instance already stamps appContextSlice onto runs), transcripts cleanup ("Working Context" section between sessions and Cleaning Agent) + scribe assistant bar (dual-role; save-side stamping awaits ctx_associations), knowledge-graph header, notes (footer + info panel + mobile dock swapped to new `NoteContextSection`, **old `NoteContextPicker` deleted**; amber/green `NoteContextStatusIcon` on the active tab; sidebar "homeless notes" hint — no-value ≠ non-matching, opt-in show, display-only). Follow-ups parked: notes local multi-scope filter UI (filter-mode field is ready), scope-orphan hint via bulk read, overlay-catalogue registration for the Window wrapper, skills authoring after Arman's real-world pass.
- `2026-06-10` — claude: **Official ContextAssignment component set** (`features/scopes/components/context-assignment/`) — the lab's approved field extracted into the real shipping module, demoed live in the Context Lab. **Core:** `ContextAssignmentField` (modes `assignment`/`active`; org default-but-changeable per product decision — `defaultOrganizationId` → active org → richest; existing scope tags hydrate via `useEntityScopes`; live writes through the canonical `setEntityScopes` chokepoint; inline quick-add creates REAL scopes (`createScope` thunk) and tasks (`quickCreateTask`); active mode never touches `appContextSlice` — it emits via `onApplyActive` for a Surface A host). **Wrappers:** `ContextAssignmentPopover`, `ContextAssignmentDialog`, `ContextAssignmentWindow` (WindowPanel; inline-controlled — overlay-catalogue registration is the approved-then-do step). **Fetch discipline (load-bearing):** core tree = one boot fetch into Redux, NEVER refetched by components; new `scopeTreeInvalidationMiddleware` (registered in the store) watches every structural-mutation fulfilled action (`scopeTypes|scopes/create|update|delete`, `templates/apply*`) and force-refreshes the tree once (400ms debounce) — new structural mutations must add their action type to its list; engagement data (projects/tasks/items) via `context-assignment/data.ts` — module-scoped 60s TTL cache + in-flight dedup shared across all instances. **Loud gaps:** project/task association writes log-and-toast until `ctx_associations` lands; live project quick-add warns (slug/membership wired per-surface at rollout).
- `2026-06-10` — claude: **scope cells now reach the agent** (the core promise, previously unwired — cells lived in `ctx_context_item_values` but `resolve_full_context` read only brokers). DB: `migrations/ctx_resolve_full_context_scope_cells.sql` merges current cells of contributing scopes into `variables` (`inject_as:'direct'`, brokers override on collision) and adds membership-validated `p_scope_ids`; live-verified (17-cell matter scope resolves; non-member gets 0). aidream: `ScopedRequest.scope_ids` threaded through all 7 `resolve_agent_context_block` call sites (commit `aff98394`; pre-deploy backends ignore the field). FE: `assembleRequest` sends `scope_ids` every turn; new `syncConversationScopes` thunk stamps active selections onto conversation tags (union, never replace) at send time. See §"Live delivery path". Also in this change: `setEntityScopes` now calls the atomic `set_entity_scopes` RPC (cap-validated, one transaction — replaces the non-atomic 3-call diff that could strand partial tag sets) hardened with an auth preamble + `REVOKE FROM anon` (`migrations/ctx_set_entity_scopes_auth.sql`); `EntityScopeTagger` gained an in-flight guard + error toast (failures were silently swallowed) and a lint-clean scopeable-gate; legacy scope/type mutations mirror into the new `scopesTree` slice via string-matched `extraReducers` (sidebar no longer goes stale after legacy edits); `ContextItemValueType`/`OrgRole` aligned to the DB enums (`date` cells were silently dropped by `toResolvedValue` and missing from `listContextValues`; phantom `viewer` removed); tree-error state got a Retry button; sign-out resets `appContext`/`scopesTree`/`contextValues`; `mapPgError` logs the raw PG error before the friendly mapping; `acceptInvitation` swapped to the atomic `accept_organization_invitation` RPC; `ScopeDetailView` shows item display names (was raw UUID prefixes) + `value_date`; `/organizations/[orgId]/settings/scopes` loading is a skeleton (was banned "Loading…" text). Security findings from the same audit are deferred to the pre-launch overhaul — recorded as **D2 in `KNOWN_DEFECTS.md`**; full audit plan at `~/.claude/plans/you-are-conducting-an-polymorphic-dragonfly.md`.
- `2026-06-10` — claude: **Context Lab** (`/demos/scopes/context-lab`, dev-only) built out as the full real-data design surface for the ctx-association overhaul (`docs/ctx/ctx-association-architecture.md`). One page, six framed blocks, all on the user's REAL orgs/scopes/items/values/projects/tasks/files — only writes are faked (console.log of the exact future rows): (1) `ContextField` in **assignment** mode (durable `ctx_associations`; multi-select; this-org+unassigned default with per-section Show-all; inline quick-add; real lateral suggestions from `ProjectNode.scope_ids`; live "rows this writes" panel), (2) the same field in **active** mode (single-select per type → `appContextSlice`) plus a **composer-bar variation** (chip bar + popover; picking a scope adopts its org), (3) **assign-to-context-item** (scope-first across all orgs, org derived; cascade item→scope→type→org), (4) **scope-as-value** relational graph with derived reverse lookup, (5) **required-slots→gaps** computed from real `ctx_context_item_values` (live-verified "3/3 compliant" on Clients · Client Type), (6) **Context Hints** reading the real active context (nudge, never auto-write). Fixed-size cards (no layout shift), canonical `resolveColor`/`resolveIcon` everywhere. Open decisions parked for Arman: org changeable vs locked on assignment; where the field surfaces; chat variation A/B; §7.2 cardinality; §7.3 enforcement.
- `2026-06-06` — claude: extend the ghost-board onboarding to the **org overview page** (`features/organizations/components/OrgWorkspace.tsx`) — the real first-touch surface. Its "Context & Scopes" empty state ("Set up your scopes" + two buttons) is replaced with `<ScopeOnboarding>`, so a brand-new org (personal OR business) lands directly on the rich, real-feeling ghost board instead of a thin CTA. This was the third and last divergent scope empty state; all three now share one component. Also enriched the professional ghost dimensions to feel as full as the personal set: Clients (Industry/Contact/Status), Departments (Lead/Headcount/Budget), Locations (Region/Type/Headcount), and bumped Pets/Goals to three columns — every preview card now shows "3 details tracked" with realistic cells.
- `2026-06-06` — claude: onboarding follow-ups. (1) `TemplateGalleryDrawer` "Individual scopes" mode now **dedupes** — the same scope ("Client" appears across ~12 templates) collapses to one row, keeping the richest example (most context items); the universally-understood scopes (Client, Customer, Department, Team, Project, Location, Region) are **pinned to the top** so a new user meets "Clients" first. Dedup runs after the personal/category/query filters so nothing is wrongly dropped. Caption updated. (2) `isPersonal` is now threaded `settings/scopes/page → ScopeManagerPage → ScopeOnboarding`, so the settings empty state also shows the personal-flavored ghost board for personal orgs.
- `2026-06-06` — claude: unified first-run onboarding (`features/scope-system/components/ScopeOnboarding.tsx`) replaces the two divergent empty states (`ScopesManager` + `agent-context/.../ScopeManagerPage`). Never opens with the word "scope": leads with "What does your organization/life revolve around?", then a **ghost preview board** — common dimensions (Clients/Departments/Locations for pro, Kids/Pets/Goals for personal) as real-looking mini tables (rows=scopes, columns=context items, cells=sample values), marked "Preview — nothing is saved until you add it." Each card's "Add this" creates the scope type + its columns (context items) only — **no sample rows seeded** (no garbage data). Below: the three explicit paths — Create my own (`AddScopeModal`), Use an industry template (DB-backed `TemplateGalleryDrawer`, templates mode), Start with one scope (same drawer, individual mode — surfaces the previously-hidden "Individual scopes" feature). Added an `initialMode` prop to `TemplateGalleryDrawer`. Writes reuse the drawer's Redux thunks (no parallel mutation path). Also stripped "Priority" as a scope type from the hardcoded `ScopeTemplateStarter` presets (universal + law_firm) — priority is a context item/status, never a dimension (the anti-scope-type).
- `2026-06-06` — Scope UI Wave B: full-page **Manage/Edit routes** for all three levels (the Hub/Manage pattern, gold-standard = the org pages). Each is a real page (context above + form + nested links + drill), with the drawers kept as quick accelerators: **Context item** `…/context-items/[item]/edit` (`ContextItemEditView` + shared `ContextItemSettingsForm`, which now also powers the slimmed `EditContextItemSheet` — one editor, no duplication); **Scope** `…/[type]/[scope]/edit` (`ScopeEditView`: basics + reused `ScopeAdvancedSection` + delete); **Scope type** `…/[type]/edit` (`ScopeTypeEditView` + `ScopeTypeSettingsForm`: labels/icon/color/desc/sort/max + cards to the two nested systems). Color now routes through `update_scope_type`'s `p_color` (removed the banned direct `ctx_*` write). Entry points: item hub, scope hub ("Edit settings"), and type hub ("Edit <Type> Settings") all link to the full pages while keeping a quick-edit drawer. Reserved-slug validation added to the item form. Earlier same-day: all 4 context-items levels + orphan-route links + terminology + route inventory.

- `2026-06-06` — Scope UI: pages matrix + Wave A (Context-Item Hub pages). New tracking doc `docs/SCOPE_PAGES_MATRIX.md` defines the uniform Hub/Manage pattern per level (Org pages = gold standard). **Wave A built:** Context Items Collection Hub `…/scopes/[type]/context-items` (`ContextItemsHub` — view/add/reorder/edit all items, drill into each) and the Context Item Hub `…/scopes/[type]/context-items/[item]` (`ContextItemHub` — the item's own settings + Details, then every scope's value for it, inline-editable via `ScopeFieldInput` with a `nameLabel`/`nameHref` override, each row deep-linking to the value page). The scope-type page (`ScopesList`) now links the "Context Items" heading + each item name to these pages ("Open page" + ↗). Added reserved-slug guard (`RESERVED_SCOPE_SLUGS`/`isReservedSlug`) and new route builders (`contextItemsHref`, `contextItemHref`, `contextItemEditHref`, `scopeTypeEditHref`, `scopeEditHref`). Remaining per the matrix: Manage routes (Wave B: `/[type]/edit`, `/[item]/edit`, `/[scope]/edit`), collection-manage + scopes collection hub (Wave C), direct routes + legacy `/agent-context/*` retirement (Wave D).
- `2026-06-06` — Scope UI: complete sort_order across all three levels + reusable reorder UI. **DB:** added `ctx_scopes.sort_order` (migration `ctx_scopes_sort_order.sql`); updated every scope-returning RPC to order by it and emit it — `list_scopes`, `get_scope_tree`, `get_entity_scopes`, `search_scopes`, and the sidebar tree builders `get_user_scopes` / `get_user_scopes_with_projects`; `create_scope`/`update_scope` gained `p_sort_order` (create appends within org/type/parent). Scope **types** and **items** were already ordered by their `sort_order` in their fetch RPCs (verified). **FE:** `Scope` type + `scopesSlice` adapter now sort by `sort_order`; `ScopesList` orders scopes by `sort_order` (was `updated_at`); create/update scope thunks carry it. **Reorder UI:** new reusable `ReorderDialog` (dnd-kit drag-and-drop + up/down arrow fallback) wired as "Edit order" for scopes + context items on the scope-type page (`ScopesList`) and "Reorder types" on the org scopes overview (`ScopesManager`) — owner/admin only. Sort-order is also directly editable in each edit surface: `EditScopeTypeSheet` (advanced), `ScopeAdvancedSection` (new Display-order field), `EditContextItemSheet`. (Note: `ScopesManager` has 8 pre-existing `react-hooks/refs` lint errors from `<InlineMediaRef ref=…>` using `ref` as a prop name — predates this change, not addressed here.)
- `2026-06-06` — Scope UI: permissions model + safety fix + not-found states (user-reported bugs). **Safety:** the individual scope page (`ScopeDetailEditor`) no longer shows "Edit <Type> Settings" — that button edited the org-wide *dimension* (all scopes of the type), so exposing it on one instance let a non-admin reconfigure the whole org's handling of that type. It's removed; type editing lives only on the scope-type page, gated. The scope page now has an org›type›scope breadcrumb for "up" nav. **Permissions** (UI layer): `canManageSettings(role)` (owner/admin) gates all *structural* actions — edit scope type, add/edit/delete/reorder context items, add-field-from-scope-page, delete scope type, delete scope; *instance* actions (create scope, edit scope name/desc/slug/settings, set values) stay open to members. Each scope page now fetches the caller's org role and passes `canManage` down. (Server-side RLS/RPC enforcement is the necessary next layer — UI gating alone is not a security boundary.) **Not-found:** mistyped scope/type/item slugs previously spun forever; new `ScopeNotFound` card shows once the relevant data has loaded but nothing matches (new `selectScopeTypesLoadedForOrg` / `selectScopesLoadedForType` + existing `selectItemsLoadedForType` distinguish loading from missing).
- `2026-06-06` — Scope UI finalization, Wave 5 + Round-2 corrections (user feedback on the scope-type page). **Item detail route** added: `/organizations/:org/scopes/:typeSlug/:scopeSlug/:itemSlug` (`app/(core)/…/[itemId]/page.tsx` + new `ScopeItemDetail`) — breadcrumb (org › type › scope › item), item identity, the editable value for that scope×item (reuses `ScopeFieldInput`, all types incl. date), a Details panel (key/slug/type/category/tags/fetch-hint/sensitivity/sort-order), Edit-item access, prev/next nav; reachable via a new "open item page" ↗ icon on each field of the scope detail page. The user's full headline URL now resolves end-to-end. **DB:** added `ctx_context_items.sort_order` (migration `ctx_context_items_sort_order.sql`); `list_scope_type_items` + `get_scope_context` emit + order by it; `create_context_item` gained `p_sort_order` (defaults to append); FE adapter now sorts items by `sort_order`. **Corrections:** removed the "Scope Type" badge; the scope-type header now reads as an authoritative "<ORG> / <Type>" page (org eyebrow + large title, counts full-width below the logo); `ContextItemAddForm` shows Name/Type/Description/Category(dropdown)/Tags(chip-input) inline with Advanced = sort order/fetch hint/sensitivity and no duplicate Add button; the scopes table freezes the first column + header row on scroll and shows all item columns; up/down reorder on each context-item row + a Sort-order field in `EditContextItemSheet`. The `/scopes`-less alias is dropped per the user (the WITH-`scopes` form is the canonical structure).
- `2026-06-06` — Scope UI finalization, Wave 4a (scope advanced edit). New `ScopeAdvancedSection` on the scope detail page (`ScopeDetailEditor`): a disclosure exposing an editable, format-validated **URL slug** (with Auto) and a free-form **Settings (JSON)** editor (validated as a JSON object), both persisted via the existing `update_scope` RPC (`p_slug` / `p_settings`). FE-only (no DB change). The `/organizations/:org/:typeSlug` (no-`scopes`) route alias is intentionally deferred to a separate isolated change (reserved-segment rewrite that could otherwise shadow org routes).
- `2026-06-06` — Scope UI finalization, Wave 3 (human-readable slug routing). DB (Matrx Main): added nullable `slug` to `ctx_scope_types` (unique per org), `ctx_scopes` (unique per scope type), and `ctx_context_items` (unique per scope type, active rows), backfilled kebab-case + partial-unique indexes (`migrations/ctx_add_slugs.sql`). RPCs: `create_scope_type`/`update_scope_type` gained `p_color` + `p_slug` (color now persists through the RPC — the old `persistColorIfChanged` direct write is removed); `create_scope`/`update_scope`/`create_context_item` gained `p_slug`; `list_scope_type_items` + `get_scope_context` now emit `slug` (`list_scope_types`/`list_scopes` already emit via `to_jsonb`). Supabase types + aidream models regenerated. FE: `toSlug`/`isValidSlug`/`isUuid` in `utils/slugify.ts`; new `utils/scopeRoutes.ts` URL builder; resolver selectors `selectScopeTypeBySlugOrId` / `selectScopeBySlugOrId` / `selectItemBySlugOrId`; `ScopesList` and `ScopeDetailEditor` resolve their route segments as slug-or-id and emit slug hrefs; `slug` added to `ScopeType`/`Scope`/`ContextItem` types; create paths auto-generate a slug and advanced-edit (EditScopeTypeSheet, EditContextItemSheet) expose an editable, format-validated slug (DB unique index is the hard guard). Canonical URL `/organizations/:org/scopes/:typeSlug/:scopeSlug`; ids still resolve. Routes compile (200) for both slug and id forms. Follow-up: org-overview `ScopesManager` + global `ScopeDetailView` (in `features/scopes/`) still emit id hrefs (they resolve); scope-slug editing UI lands in Wave 4.
- `2026-06-05` — Scope UI finalization, Wave 2 (`date` value type, end-to-end). DB (Matrx Main): `context_value_type` enum += `date`; new `value_date date` column on `ctx_context_item_values`; `get_scope_context`, `set_context_value`, and `set_scope_context_value` updated to read/emit `value_date` (the last gains a `p_value_date` param). Recorded in `migrations/ctx_add_date_value_type.sql`; Supabase TS types regenerated; aidream `db/models.py` regenerated (DATE enum + `value_date` DateField). FE: `ContextValueType` += `date` with a Calendar `VALUE_TYPE_CONFIG` entry; `ScopeContextRow` + `setScopeContextValue` thunk/reducer + `makeEmptyRowFromItem` + `useScopeAutoSave` carry `value_date`; native date inputs in `ScopeFieldInput` and `EditScopeValueSheet`, and a date branch in `ScopesList.renderValue`. The legacy `/agent-context/items` editor is wired too (`ContextItemForm` ValueInput + `buildValueData`, `ContextValuePreview`, both pages' save guards, `ContextValueFormData`). Verified end-to-end against the live DB (create date item → `set_scope_context_value(p_value_date)` stored & returned → `get_scope_context` emits `value_date`).
- `2026-06-05` — Scope UI finalization, Wave 1 (scope-type page polish, on the live `features/scope-system/` path). New persistent spec at `features/scope-system/docs/SCOPE_UI_OVERHAUL.md` (full backlog + View/Edit/Advanced inventory + waves). Fixed the scope-type icon color: the old `EditScopeTypeSheet` used the full-palette `TailwindColorPicker` whose returned keys (`blue`, `red`, `slate`, …) weren't in `SCOPE_COLORS` (8 keys), so `resolveColor` silently fell back to a hashed color and the icon pill only applied `fg` (no tint). `SCOPE_COLORS` expanded to 17 curated keys (the single source of truth), new `ScopeColorPicker` iterates it (picker ≡ resolver by construction), and icon pills now render `bg + fg + ring`. New reusable primitives under `features/scope-system/components/`: `ScopeColorPicker`, `ScopeGlyph` (stable, case-normalizing icon — avoids the `react-hooks/static-components` rule that the old `const Icon = resolveIcon()` pattern tripped), and `ContextItemAddForm` (one inline add form with Add / Add & Next / Cancel + advanced description/category/tags, replacing the single-shot flow in `ScopesList` and the bespoke `AddContextItemInline`). `ScopesList` reworked: org breadcrumb (personal-org aware), description under the title, a stat row (counts), "Edit {label_singular} Settings" button, and an item list that drops the snake_case key + raw data-type and shows category/tags/description. Scope-type `page.tsx` now passes org name/slug/isPersonal. No DB or RPC changes in this wave. Date type, slugs, settings JSON, and route aliases follow in Waves 2–4. Full spec: `features/scope-system/docs/SCOPE_UI_OVERHAUL.md`.
- `2026-06-02` — Phase F (kg-suggestions): `ScopesHub` now renders `<KgSuggestionsNavButton>` (opens the global suggestion drawer via the overlay system, with a live pending-count badge) and `<HeavyHitterSuggestionsInbox>` (the "Suggest a scope" card for recurring unaffiliated entities). Read-only consumers of scope data; no scopes-slice changes. See `features/kg-suggestions/FEATURE.md`.
- `2026-05-16` — composer: initial canonical doc. Codifies the context-vs-scope model, global-vs-local invariant, contradiction-warning rule, multi-scope cardinality, orphan handling, fetching invariants, resolution algorithm, data model, Redux shape, component map, routes, retirement inventory. Replaces the planning content scattered across `features/agent-context/{URGENT-file-updates-needed,TODO-URGENT-scope_system_team_instructions,scope_system_execution_plan}.md` and `features/scope-system/REBUILD_PLAN.md` (deleted).
- `2026-05-16` — composer: Phase 1 lands. `appContextSlice` moved to `lib/redux/slices/`. New module under `features/scopes/` with `types.ts`, `service/scopesService.ts` (sole `ctx_*` chokepoint), three Redux slices, six thunks, selector layers (tree, active-context, context-values, templates, resolved-context with the local-vs-global merge algorithm), and four public hooks. Mounted in `rootReducer` as `state.scopesTree` / `state.contextValues` / `state.scopeTemplates` (legacy `state.scopes` still owned by the old entity-adapter slice until Phase 5). ESLint chokepoint rule added (`scopesChokepointSyntaxRestrictions`) with a documented retirement-queue allowlist. `app/DeferredSingletons.tsx` boots `ensureScopeTree` alongside the legacy `fetchFullContext` (Phase 2 cuts the legacy task).
- `2026-05-16` — composer: Phase 2 lands. Surface A components shipped under `features/scopes/components/active-context/`: `<ActiveScopePicker />` (reads tree via `useScopeTree`, lazy-fetches tasks via `ensureScopeTasks`, lazy-loads orphan projects via `ensureOrphanProjects`, dispatches `setOrganization`/`setScopeSelections`/`setProject`/`setTask`), `<ActiveScopeChips />` (compact chip-strip variant for headers/footers), and `<ContradictionBanner />` (non-blocking warning for global-vs-local scope-type collisions, fed by `makeSelectResolvedContext`). `DirectContextSelection.tsx` reduced to a thin shim — all four legacy call sites (shell Sidebar, NoteSidebar, MobileNotesView, ChatSidebar) now render the new picker. `fetch-full-context` idle task removed from `app/DeferredSingletons.tsx`; legacy hierarchy consumers still self-fetch via `useNavTree()`.
- `2026-05-16` — composer: Phase 3 lands. Surface B components shipped under `features/scopes/components/entity-context/`: `<EntityScopeTagger />` (M2M via `useEntityScopes`; controlled + uncontrolled modes) and `<EntityTargetPicker />` (FK over orgs/projects/tasks, no `ctx_*` writes). Added the `entityScopesByKey` substate to `scopesTree` with `entityScopesFetchPending/Fulfilled/Rejected/Updated` actions, the `getEntityScopes` chokepoint method, the `ensureEntityScopes` thunk, and the `useEntityScopes` hook. `setEntityScopes` now writes through to the entity-scopes cache so taggers see their own write instantly. `features/notes/components/NoteContextPicker.tsx` and `features/tasks/components/TaskScopeFilter.tsx` fully migrated to the new abstractions and no longer import from `features/agent-context/redux/scope/**`.
- `2026-05-16` — composer: Phase 4 lands. `/scopes` route tree created at `app/(a)/scopes/` with `page.tsx` (Hub), `manage/page.tsx`, `[scopeId]/page.tsx`, `templates/page.tsx`, and `settings/page.tsx`. Five new components under `features/scopes/components/management/` back the routes: `<ScopesHub />`, `<ScopesManager />`, `<ScopeDetailView />`, `<TemplatesGalleryPanel />`, `<ScopesSettingsPanel />`. All five read exclusively through the canonical `useScopeTree` / `useTemplates` / `useContextValues` / `useActiveContext` hooks — they touch no `ctx_*` table directly. `app/(a)/organizations/[orgId]/scopes/page.tsx` reduced to a thin wrapper that renders `<ScopesManager orgIdOverride={orgId} />`. The nested `[typeId]/[scopeId]` editor routes still point at the legacy `features/scope-system/` editors pending Phase 5 mutation chokepoints.
- `2026-05-16` — composer: Phase 5 kickoff. `/scopes` added to `features/shell/constants/nav-data.ts` and `constants/favicon-route-data.ts` (the legacy `/agent-context` entry stays for now, marked "(legacy)"). `features/tasks/components/TaskScopeTags.tsx` migrated to read via `useScopeTree` and write via `useEntityScopes` — first non-Phase-3 consumer fully off the legacy `features/agent-context/redux/scope/**` slices. Full Phase 5 backlog documented in §"Current work / migration state" as a sequenced playbook (read-path consumers safe to migrate now; mutation consumers blocked on Python-side chokepoint RPCs; hierarchy-slice future split decision deferred until consumer migrations land).
- `2026-05-16` — composer: Phase 5 read-path sweep. Migrated `features/notes/components/{NoteSidebar,NotesView,mobile/MobileNotesList}.tsx`, `features/tasks/components/{TaskListPane,TaskPreviewWindow,TasksContextSidebar}.tsx`, `features/tasks/widgets/quick-create/TaskQuickCreateCore.tsx`, `features/tasks/redux/{selectors,thunks}.ts`, `features/surfaces/components/AgentSurfacesPanel.tsx`, and `features/agent-apps/components/inputs/AgentAppHierarchyCascade.tsx` off the legacy `features/agent-context/redux/scope/**` slices. Added two new tree selectors (`makeSelectEntityIdsMatchingScopes`, `selectAllEntityScopeAssignmentsFlat`) so the task-filter selector chain can compose against `entityScopesByKey` without touching the legacy assignments slice. Added `agent_surface_binding` to `ScopeAssignmentEntityType`. Deleted the bespoke `CustomScopeSection` inside `AgentSurfacesPanel.tsx` in favour of `<EntityScopeTagger variant="compact" allowMultiPerType />` in controlled mode. Phase 5 backlog rewritten to reflect only what remains: mutation-heavy editors blocked on chokepoint RPCs, the hierarchy-slice future split decision, and `HierarchyHoverMenu.tsx`'s `createScope` call.
- `2026-05-16` — composer: full-repo type-check pass. Exported a new `isScopesRpcErr<T>()` type guard from `features/scopes/types.ts` and routed every consumer through it (`ensureScopeTree`, `ensureEntityScopes`, `setEntityScopes`, `ensureContextValues`, `ensureOrphanProjects`, `ensureScopeTasks`, `ensureTemplates`, `useEntitiesByScopes`). The repo runs with `strictNullChecks: false`, which breaks TS's default discriminated-union narrowing on boolean `ok` discriminants — the helper restores correct `data` / `error` narrowing without flipping the global strict setting. Also re-pointed three legacy `features/agent-context` editors at the canonical two-arg `useContextItemValue(itemId, scopeId)` / `useContextVersionHistory(itemId, scopeId)` signatures (those call sites were passing `itemId` only and silently fetching with `undefined` scope), and swapped four `DynamicIcon` callsites in scopes/tasks UIs off the unsupported `style={{ color }}` prop onto the canonical `color` prop. Repo-wide `tsc --noEmit` is now zero-error.
- `2026-05-16` — composer: Redux selector stability — `ActiveScopePicker` / `EntityTargetPicker` no longer pass a fresh `[]` from `useAppSelector` when there is no task level; `tasksForLevel` is `undefined` until a level exists, with `?? []` only inside `useMemo` / handlers. Eliminates *"returned a different result with the same parameters"* / unnecessary rerenders.
- `2026-05-16` — composer: sidebar picker bug fixes. Two issues addressed: (1) `scopesService.getScopeTree` was relying on `organization_members.SELECT` RLS to filter rows, but that policy is `qual = true` — so every org_members row in every org the user belongs to was being returned, producing one duplicate-org-row per co-member (e.g. 1 + 3 + 3 = 7 phantom org rows in the picker's "Organization" flyout for a user with 3 orgs that had 1, 3, and 3 total members). The fetch now passes `.eq("user_id", userId)` explicitly. `scopesSlice.treeFetchFulfilled` also dedups `organizationIds` via a `Set` for defense-in-depth so a future regression upstream can never reintroduce visible duplicates. (2) `ActiveScopePicker` redesigned to put scope-type rows (the actual work-defining items — kids, clients, departments, projects) at the TOP of the expanded picker, flattened across every org the user belongs to via `selectAllScopeTypesFlat`. Org / Project / Task rows moved below as drill-downs. Selecting a scope from any org now auto-promotes that org into the active context (Surface A invariant preserved — the picker is the canonical Surface A writer). Same-named scope types across orgs get an "Org" suffix only when collision happens (`scopeTypeRowLabel`). Multi-select-across-types continues to work as before via `setScopeSelections`; the cardinality contract (one scope per type) is unchanged.
- `2026-06-24` — categories: canonical `platform.categories` primitive lands (foundation, purely additive). New §"The canonical taxonomy — `platform.categories`" documents it. `service/categoriesService.ts` (sole `cat_list`/`cat_create` chokepoint, untyped-rpc bridge until `db-types` regenerates, returns `ScopesRpcResult`, never throws); `categoriesByDimension` cache + `categoriesFetch{Pending,Fulfilled,Rejected}`/`categoryCreated` actions on `scopesSlice`; `redux/thunks/categories.ts` (`loadCategories`/`createCategory`, deduped); `redux/selectors/categories.ts` (`selectCategoriesFor`); `hooks/useCategories.ts`; `PlatformCategory`/`CategoriesEntry`/`CategoryDimension` types; `categoryDimensions.ts` (`CATEGORY_DIMENSIONS`). Replaces the fragmented `shortcut_categories` / `skl_categories` / hardcoded `INDUSTRY_CATEGORIES`+`DEFAULT_CATEGORIES` systems — migration is dimension-by-dimension. **Category assignment reuses the association edge** (`assoc_add targetType='category'`), no assignment table. RPC surface is **read+create only**: read-only dimensions migrate now; the stateful editors need `cat_update`/`cat_delete`/`cat_reparent` first.
- `2026-05-16` — composer: React Compiler conformance pass. Migrated every `useMemo(makeSelectX, [])` in the scopes module to the inline-function form `useMemo(() => makeSelectX(), [])` (`useEntityScopes`, `useContextValues`, `ActiveScopePicker`, `ActiveScopeChips`, `EntityTargetPicker`, `EntityScopeTagger`, `TaskScopeTags`) so the `react-hooks/use-memo` rule passes. Rewrote the `ActiveScopePicker` "collapsed icon" branch from a component-during-render (`(props) => <DynamicIcon ... />` inside `useMemo`) to a discriminated `{ kind: 'lucide' | 'dynamic' }` descriptor — components must never be created during render. Replaced two `useMemo` blocks in `ScopeDetailView` with React-Compiler-friendly IIFEs (the typed-callback form was preventing the Compiler from preserving memoization). Rewrote `ScopesManager`'s "auto-expand on org change" effect onto the React 19 canonical `useState`-during-render pattern (`if (lastOrgId !== org.id) { setLastOrgId; setCollapsed; }`). Replaced the "reset state on disabled" effect branch in `useEntitiesByScopes` with a derived-return at the call site (no setState in effect for the disabled case) and added a single justified `react-hooks/set-state-in-effect` disable on the legitimate async-fetch subscription path. Removed two dead back-compat re-exports (`Folder` from `TaskScopeTags`, `ScopeNode` from `ContradictionBanner`) flagged by `no-barrel-files`. Full ESLint run across `features/scopes/**`, `features/tasks/components/TaskScopeTags.tsx`, the migrated `features/agent-context/components/*` editors, and `app/(a)/{scopes,agent-context}/**` is now zero-error, zero-warning; repo-wide `tsc --noEmit` is still zero-error.

---

> **Keep-docs-live rule (CLAUDE.md):** changes to scope cardinality, the global-vs-local invariant, contradiction rules, the resolution algorithm, fetching invariants, or the table layout must update this doc AND `features/agent-context/FEATURE.md` where they intersect AND `features/scopes/docs/RPC_CONTRACTS.md` if the contract shifts. Append to the change log on every substantive edit.
