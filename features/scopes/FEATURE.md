# FEATURE.md — `features/scopes` (LOCAL MECHANICS ONLY)

> Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/scopes-context/STATE.md — read it before touching this feature in ANY repo.

**The model, the invariants' rationale, the data model, the resolution contract, the delivery
path, the migration status and the change history are NOT in this file** — they were centralized
into the `scopes-context` node kit on 2026-08-25 (`STATE.md`, `DECISIONS.md`, `HANDOFF.md`,
`context-delivery/STATE.md`). What is left here is the code-safety rules and the file map for
this directory.

## 🚨 Rules an agent editing this directory must obey

1. **`scopesService.ts` is the ONLY file that may query the `context.*` tables**, and ESLint
   enforces it. The boy-scout rule applies — fix violators on sight.

   **What the guard actually checks** (`scopesChokepointSyntaxRestrictions`, `eslint.config.mjs`,
   rewritten 2026-09-11 under DD-109): four `no-restricted-syntax` selectors, each an error —
   `.schema("context")`; importing `@/utils/supabase/contextDb`; `.from()` on any `context` table
   by name; `.rpc()` on any scope/context RPC name. Any one of the four reaches the schema, so
   all four are banned.

   **You do not maintain the name lists.** They are DERIVED from `types/database.types.ts` on
   every lint run: the tables are every key of the generated `context` Tables block (13 today);
   the RPCs are that schema's own Functions block plus every `public` function whose name is in
   the scope/context family grammar (48 today). A new context table or scope RPC is banned the
   moment `pnpm sync-types` lands it — nobody has to remember. If the derivation cannot find the
   schema blocks it THROWS and the lint run fails; it never silently bans nothing, which is the
   failure mode that let the old `ctx_*` rule sit dead for months.

   Why a name grammar for the RPCs and not the schema block alone: Postgres exposes these to
   PostgREST from `public`, and their generated signatures almost all return `Json`, so neither
   the schema block nor the return type can find them. The grammar rejects every module-prefixed
   lookalike (`agx_list_scoped`, `crm_inbox_list_scope_counts`, `hr_my_context`,
   `admin_create_schema_template`, …) and is deliberately over- rather than under-inclusive:
   checked against `pg_get_functiondef` on the live DB (2026-09-11), all but
   `get_user_form_context` and `list_entities_by_scopes` genuinely touch `context.*`, and those
   two have no call sites here.

   **What it does NOT check:** a `schema: "context"` / `schemaName: "context"` string inside a
   registry or resolver config object — `features/item-presentation/registry.tsx` and the three
   `createRecordResolver` entries in `features/matrx-envelope/referenceResolvers.ts` still bind
   the schema declaratively and are NOT caught. Neither is a dynamic (non-literal) table or RPC
   name, nor a scope RPC whose name falls outside the family grammar.

   **Who is exempt, and why:** the allowlist at the bottom of `eslint.config.mjs` (§"features/scopes
   chokepoint allowlist") names every exempt file with its reason — 12 today. Three are server-side or
   service-role doors this `"use client"` service cannot serve (`app/(core)/scopes/s/[scopeId]/page.tsx`,
   `app/api/admin/system-context/route.ts`, `app/api/stripe/class-checkout/route.ts`); seven are the
   retirement queue — live duplicate paths (`features/scope-system/redux/{contextItemsSlice,templatesSlice,scopeValuesSlice}.ts`,
   `features/agent-context/redux/scope/{scopeTypesSlice,scopesSlice}.ts`,
   `features/agent-context/{service/hierarchyService.ts,redux/hierarchyThunks.ts}`) that still hold a
   second apply-template path, a second set-value RPC, a duplicate scope-type read path and a third
   full-context read (`get_user_full_context`). Delete the allowlist entry when the duplicate path
   goes; it is not a standing exemption.

   Write an exempt path as a glob, never as a literal dynamic route: ESLint globs are minimatch,
   where `[scopeId]` is a character class, so `app/(core)/scopes/s/[scopeId]/page.tsx` matches
   nothing. Use `app/(core)/scopes/s/**`.

   Prior state, for the record: before 2026-09-11 the rule banned `.from('ctx_*')` string literals,
   of which zero had remained since the tables moved into the `context` schema — it matched nothing,
   and the allowlist beside it held 19 paths of which 18 also matched nothing: **4** of those named
   files no longer existed, and **4** were dynamic routes spelled literally, which minimatch could
   never have matched even while the files did exist. Register item DD-109 in
   `common-docs/projects/data-doctrine-adoption/REGISTER.md`.
   (The tables are `context.scope_types`, `context.scopes`, `context.context_items`,
   `context.context_item_values`, … — the old public `ctx_*` names no longer exist.)
2. **The `assoc_*` / `cat_*` / `ues_*` RPC families are called ONLY inside
   `@ai-matrx/associations` (W5 swap, 2026-08-29).** The host wiring modules
   `service/{associationsService,categoriesService,favoritesService,favoritesCore}.ts`
   re-expose the package chokepoints under their historical names — no other file in
   this repo may call those RPCs, and no new local implementation may appear beside
   the package (C9).
3. **Only `components/active-context/**` may write `appContextSlice`.** Importing
   `setOrganization` / `setScopeSelections` / `setProject` / `setTask` / `setConversation` /
   `setFullContext` / `clearContext` anywhere else is banned by
   `appContextWriteSyntaxRestrictions` in `eslint.config.mjs`. The handful of legitimate outside
   writers carry a justified `eslint-disable-next-line`.
4. **Association and tagging thunks NEVER write `appContextSlice`.** A durable edge is a stored
   relationship, not the user's active working context.
5. **`scope_selections` is keyed by SCOPE ID and selection is additive** — never evict a
   same-type sibling, never treat a key as a scope_type_id. Resolve a scope's type from the tree
   (`selectActiveScopeIdsByType`).
6. **No refetching except on an explicit user refresh click.** Tasks are never in the root fetch.
   `unfetched` and `empty` are different states and must render differently. A thunk that finds a
   `loading` slot returns the in-flight promise instead of starting a second fetch.
7. **New entity types go into `platform.entity_types` FIRST**, then into the generated
   `EntityType` union — never the reverse. Never hand-write a per-consumer whitelist of allowed
   source tokens.
8. **Personal organization is a real org row** (`organizations.is_personal = true`) — never
   synthesize or persist a fake personal org id in Redux, routes, RPC args, or edges.
9. **Templates are read-only catalog here.** Mutations happen in seed scripts / admin paths.
10. **Transport failures warn; database refusals scream.** `service/rpcResult.ts` uses
    `@ai-matrx/data/net` (the NetError vocabulary) for browser-network and upstream-connect/reset classification. Never
    downgrade an error carrying a Postgres code or HTTP status. The sole probe exception is
    the package's demanded-schema contract check: exact `__not_a_uuid__`/`__probe__`
    sentinels remain local and non-persisting; every ordinary `22P02`/`P0001` stays red.
11. 🚨 **A record's VALUES go only to people who can open the RECORD, and a `SECURITY DEFINER`
    function is where that is decided.** RLS does not run inside a DEFINER function, so the table
    policy everybody reasons about is not what stands in the way: on 2026-09-11
    `public.get_scope_context` authorized on organization membership alone and handed a
    `personal` scope's 16 populated cells to a colleague who could not see the scope itself.
    Every DEFINER door that serves cell values now calls `context._assert_scope_readable(scope_id,
    'viewer'|'editor')` (or `context._scope_readable` / `_scope_readable_for` to filter), and
    `context.context_item_values` is a registered **component of `scope`** on the generated
    `iam.apply_rls(…,'component')` lane. Adding a door without the membrane, or hand-writing a
    policy over the generated one, is caught by `pnpm check:scope-access-membrane` — a live pull,
    because a function body lives in the catalog, not on disk.
    A door that LISTS scopes filters on `context._readable_scope_ids()` — the list and the record
    must agree: if a list names a record, opening it works; if opening refuses, it was never
    listed. Every DEFINER function that reads these tables is registered in
    `context.scope_door_registry` with its class and the reason, and the gate fails a door on its
    ABSENCE from that table, so a new one cannot ship undecided.
    Migrations: `migrations/ctx_scope_access_membrane_b7.sql` + `..._b7_fix1.sql`.
    **Do NOT make `context_items` a component of `scope_type`:** `context.scope_types` has no
    `created_by` and no `visibility`, so `iam.accessible_entity_ids('scope_type','viewer')` returns
    zero ids while RLS shows an ordinary member 4 rows — the field definitions would go from 57
    visible to 0 and blank every scopes screen. That needs a base retrofit of `scope_types` first.

## File map

- `service/` — `scopesService.ts` (the `context.*` chokepoint — Lane F, NOT part of the
  associations package) and `rpcResult.ts` (shared result helpers)
  are the real implementations here. Everything association-shaped is now a THIN HOST
  WIRING over `@ai-matrx/associations/core`: `associationsService.ts`,
  `categoriesService.ts`, `commentsService.ts` (the `cmt_*` chokepoint — replaced the
  deleted `features/comments/`), `favoritesService.ts`, `favoritesCore.ts`
  (server-injectable `ues_get_bulk`), `associationCandidates.ts`, `entityTitles.ts`,
  `entityRows.ts`, `associationGuards.ts`, `associationEdges.ts`. Do not grow logic in
  a wiring module — grow the package.
- `host/` — the ONE `@ai-matrx/associations` binding: `associationsStore.ts` (store
  singleton over supabase + `requireUserId`/`ensureOrgId` + errorSink + the
  `ENTITY_OVERLAY`; its dataSource carries the **`cmt_add` tap** — the task
  "someone commented" notification fires from this one seam, never a per-composer
  helper), `AssociationsHost.tsx` (the provider mount in `app/Providers.tsx`
  carrying the six UI ports: toast notifier, lazy WindowPanel shell, capture openers,
  the `file` picker override, EntityRef/door components, and `authorDisplay` —
  current-user comment-author enrichment from the `selectActiveUser*` selectors;
  dev-only `assertDemandedSchema` probe), `errorSink.ts` (→ Error Inspector
  `associations` source), `associationsHostPortsImpl.tsx` (the WindowPanel-parsing
  bindings behind a lazy edge).
- `redux/` — `scopesSlice.ts` (the canonical tree + `entityScopesByKey` +
  `contextItemsByTypeId`, the lazy per-scope-type item catalogs fed by
  `ensureScopeTypeItems` — the association/category cache fragments were DELETED in the
  W5 swap; that cache now lives in the package store), `contextValuesSlice.ts` (high-churn values sidecar; writes echo through
  `thunks/setContextValue.ts` → the sanctioned `set_context_value` RPC),
  `templatesSlice.ts`, plus `thunks/` and `selectors/`. `appContextSlice.ts` lives at
  `lib/redux/slices/`. **Structural writes go ONLY through the mutation thunks**
  (`thunks/scopeTreeMutations.ts` — create/update/delete scope type + scope;
  `thunks/contextItemMutations.ts` — create/update/delete context item;
  `thunks/applyTemplate.ts`), each backed by a SECURITY DEFINER RPC of the
  `set_context_value` family (C17 HYBRID ruling: reads stay direct RLS table
  reads, writes go through the RPCs) and folding the authoritative row straight
  into the slice — no refetch, no legacy-action mirroring.
- `hooks/` — `useScopeTree`, `useActiveContext`, `useContextValues`, `useEntityScopes`,
  `useTemplates` are Lane F implementations. `useAssociations` (alias
  `useEntityRelationships`), `useContainerLinks`, `useAssociationCandidates`,
  `useCategories`, `useEntityTitles`, `useUniversalEntitySearch`,
  `useAssociationEntitySelect` are RE-EXPORTS of `@ai-matrx/associations/react`
  (byte-compatible signatures). **Components consume hooks — never slices, thunks, or
  services directly.**
- `components/active-context/` — Surface A (the only `appContextSlice` writers): `ActiveScopePicker`,
  `ActiveScopeChips`, `ContradictionBanner`, `ActiveContextButton`, `ContextLensBar`, `LensChip`,
  `ActiveContextLensChip`, `quick-pick/` (interaction law: **row = forward, checkbox = select**).
- `components/entity-context/` — Surface B (durable tagging only): `EntityScopeTagger`,
  `EntityTargetPicker`.
- The container-centric association UI (cards / list / pickers / attached-items sheet /
  capture toolbar / `AssociationEntitySelect` / `CategorySelect` / `CategoryTagPicker`)
  ships in `@ai-matrx/associations/react` — the local `components/associations/` originals
  were deleted in the W5 swap.
- `components/quick-assign/ScopeContextTargetPicker.tsx` — the selection-only
  organization → scope type → scope → context-item cascade. **Never add structural
  writers here.** Every selected row opens through `EntityDoorControls`; each level's
  `+` door opens its canonical management/create surface from `lib/scopeRoutes.ts`.
  Its `matrx-touch-targets` root keeps every control at the 44px coarse-pointer floor.
- `components/management/` — the canonical scope-management surfaces: `ScopesManager`
  (the `/organizations/[orgId]/scopes` page), `OrgScopeTypeSection`, `NewScopeInline`,
  `EditScopeTypeSheet`, `AddScopeModal`, `ScopeOnboarding`, `TemplateGalleryDrawer`,
  `ScopeColorPicker`, `ReorderDialog` (generic drag-reorder dialog, also used by
  window-panels + war-room), plus the pre-existing `ScopesHub` family. All run on the
  canonical tree + the mutation thunks — zero legacy-module imports.
- `registry/` — `entityRegistry.ts` is the HOST BINDING for the package's registry merge
  engine: it keeps `ENTITY_OVERLAY` (icons/routes/candidate loaders — host material that
  feeds the package's overlay port) + the content-role display chrome, and every resolver
  delegates to `createEntityRegistry` from `@ai-matrx/associations/core`.
  `entityContentAdapters.ts` stays a local implementation.
- `utils/` — `scopeMismatch.ts` (pure decision logic + tests for the send-time gate),
  `categoryHierarchy.ts`, `slugify.ts` (key/slug rules shared app-wide),
  `scopeValuePayload.ts` (raw input → `value_*` column routing),
  `customComponent.ts` (jsonb → `VariableCustomComponent` narrowing).
- `lib/scopeRoutes.ts` — the canonical URL builders (`scopeSeg`, `scopeHref`,
  `scopeItemHref`, `contextItemHref`, …) plus `canonicalizeScopePath`. 🚨 **Every scope
  segment is an ADDRESS, never an identifier, and exactly ONE address is canonical: the
  slug.** A UUID address is rewritten in place by
  `features/scope-system/components/ScopeAddressCanonicalizer.tsx`, mounted once in
  `app/(core)/organizations/[orgId]/layout.tsx` beside `ScopesRouteHeader` — it reads the
  already-resolved org / type / scope / item out of Redux (it dispatches NOTHING) and
  `router.replace`s org, type, scope and item segments together in a single navigation,
  deep path and query string preserved. Substitutions go in ROUTE ORDER; a bare
  value search would let a slug that repeats at two levels rewrite the wrong segment.
  Back-port of the marketing key system's `CanonicalSegment.tsx` — fix the two together.
- Routes: `app/(core)/scopes/` (`page`, `manage`, `s/[scopeId]`, `templates`, `settings`)
  and
  `app/(core)/organizations/[orgId]/scopes/**` (the root page is the canonical
  `ScopesManager`; the deeper per-type/per-scope editors are still legacy
  `features/scope-system/` pending their own teardown wave).

---

## The unified association edge — `platform.associations`

The canonical **"associate ANY entity to ANY entity"** primitive, owned by this module. It replaces scattered `project_id`/`task_id` FK tagging and per-feature M2M tables (`ctx_scope_assignments`, `ctx_task_associations`, …) with **one polymorphic edge table**. Read this before adding any "tag / link / attach this to that" relationship anywhere in the app — extend the edge, never spin up a new M2M table or FK column.

`platform.associations(source_type, source_id, target_type, target_id, organization_id, label, metadata, role, position, created_by, created_at)`. The unique key is the **5-tuple** `(source_type, source_id, target_type, target_id, role)` `NULLS NOT DISTINCT` (`associations_unique`) — any ON CONFLICT must list all five. There is **no CHECK constraint** on the type columns; the only DB gate is the **validated FK** `source_type`/`target_type → platform.entity_types.token`, so any registered token is accepted as source OR target.

**Entity vocabulary is GENERATED, not hand-maintained.** `@ai-matrx/associations` ships it, generated inside the package from `platform.entity_types` 1:1 — import it from the package directly; this repo keeps no local copy (`pnpm check:entity-types` diffs the installed package against the live registry and screams on drift; folded into `pnpm sync-types`). It exports `EntityTypeToken` (the full FK-valid union — use it for any source/target-type argument), the runtime `isEntityTypeToken` guard + `ENTITY_TYPE_TOKENS` set, `ENTITY_TYPE_METADATA`, and curated subsets. `AssociationTargetType` (`types.ts`) is a curated "deliberate container" list proven valid at compile time with `satisfies readonly EntityTypeToken[]` — it can never drift to an unregistered token. The legacy hand-written `EntityType` union persists for existing scope-tag/favorites consumers and is converging onto `EntityTypeToken` (do not extend it — add tokens to the registry + regenerate). KNOWN HOLE: `agent_app` is in `EntityType` but is NOT a registered token (no `aga_apps` table) — a `source_type='agent_app'` write FK-violates; tracked for the association-cleanup pass.

### Where the primitive lives now (W5 swap, 2026-08-29)

The association system — service chokepoint + guards + result funnel, the
store-agnostic cache, the seven hooks, the faces (`AssociationCard(Grid)`,
`AssociationList`, `AssociationEntitySelect`, `AssociationPicker` +
`AssociationCandidateBody`, `UniversalAssociationPicker`, `AttachedItemsSheet`,
`AssociationCaptureToolbar`, `AssociationWindow`, `PrimaryEntityProvider`), the
registry merge engine, titles, favorites/recents, categories, and the generated
654-token entity vocabulary — **ships in `@ai-matrx/associations`** (design:
`/Users/armanisadeghi/code/common-docs/projects/npm-package-extraction/ASSOCIATIONS-PACKAGE-DESIGN.md`;
consumer contract: the package README). This repo contributes only the HOST
BINDING (`features/scopes/host/` — see the file map) and the thin service
wiring modules.

Local rules that still bind every consumer in this repo:

- **Import surfaces:** components/hooks → `@ai-matrx/associations/react`
  (or the re-export hooks under `hooks/`); non-React callers → the wiring
  services under `service/` (or `getAssociationsStore()` when a write must
  refresh the rendered cache). Never construct a second store.
- **Direction is canonical and singular:** resource = SOURCE, container =
  TARGET. Listing "things attached to a container" = its incoming edges.
- **Never write a per-consumer whitelist of allowed source tokens** — the one
  classifier is `isContentSourceEdge` (re-exported from
  `service/associationEdges.ts`); a whitelist silently hides every newly
  registered type (the war-room 7-type ceiling bug).
- **Stamp `label` on every attach** (some backing schemas, e.g. `rag.*`, can't
  be re-read client-side); display chain is `edge.label → fetched title →
"Untitled <type>"` — UUIDs never render.
- **Both card body and picker render through the non-blocking window shell at
  every breakpoint** (windowShell port → draggable WindowPanel on desktop,
  non-modal card on mobile). A blocking Drawer/Sheet/Dialog is forbidden for
  this association family.
- **The card grid is mounted on the scope-type (`ScopesList`) and scope
  (`ScopeDetailEditor`) pages**, at the BOTTOM under a "Resources" heading. It
  is deliberately NOT on the org home (that page has `OrgResourceRoleSection`
  over `iam.permissions`; two resource grids on one page was pure confusion).
- **Invoke the `association-entity-select` skill** before placing or extending
  an `AssociationEntitySelect`; bespoke adapters (war-room:
  `features/war-room/hooks/useThreadEntitySelect.ts`) implement the exported
  `AssociationEntitySelectAdapter` contract.

**The boundary (do not cross):** `platform.associations` answers _"what
content/containers is this attached to?"_. It does NOT absorb
`iam.permissions` (access control / sharing / RLS) or `iam.memberships`
(org/project membership) — a link is never a grant; the only sanctioned bridge
is DB-side conveyance. `OrgShareReviewCard` reads titles through the
schema-qualified `getShareableResource()` resolver.

### Data path — PUBLIC SECURITY-DEFINER RPCs

`authenticated` has **no direct grant** on `platform.*`; every operation goes
through the 23-function demanded surface (`assoc_*` ×8, `conversation_file*`
×3, `agent_resource_*` ×2, `cat_*` ×5, `ues_*` ×4,
`reference_search_candidates`) — documented, typed, and probed by the package
(`DEMANDED_RPC_NAMES`, `assertDemandedSchema`). A missing function screams as
`demanded_schema_violation` into the Error Inspector (`associations` source).

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

`platform.categories(id, organization_id, dimension, name, slug, parent_id, is_system, color, icon, position)`. System/global rows belong to the Matrx System org and carry `is_system=true` + `visibility='public'`; ordinary rows belong to their tenant org. `dimension` is free text — a new facet needs **no migration**.

**Shape is exactly two levels:** category → subcategory (or category → class). A root has `parent_id=NULL`; a child points directly to one root. The live `_category_two_level_guard` rejects grandchildren, cycles, missing/deleted parents, cross-dimension parents, hidden cross-org parents, moving a parent beneath another row, and deleting a parent while it still has children. Cross-org children may use only a public system root. This protects every writer, including legacy direct-table/admin paths.

### Where the primitive lives now (W5 swap, 2026-08-29)

| Layer         | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Service**   | `@ai-matrx/associations/core` `createCategoriesService` — the sole `cat_*` chokepoint, re-exposed as `service/categoriesService.ts` (thin host wiring). No other file may call those RPCs.                                                                                                                                                                                                                                                                                                                                     |
| **Hook**      | `hooks/useCategories.ts` — a re-export of `@ai-matrx/associations/react` `useCategories({ dimension })`, same signature. Components never touch the store or service directly.                                                                                                                                                                                                                                                                                                                                                 |
| **Cache**     | The package store's category facets (echo-insert on create preserved). The Redux `categoriesByDimension` fragments were DELETED in the W5 swap.                                                                                                                                                                                                                                                                                                                                                                                |
| **Hierarchy** | `utils/categoryHierarchy.ts` — the one two-level ordering/path resolver (host-local; the packaged pickers ship their own). Flat input returns in the exact original order; malformed/orphaned rows stay visible.                                                                                                                                                                                                                                                                                                               |
| **Pickers**   | `CategorySelect` (one value) + `CategoryTagPicker` (many) ship in `@ai-matrx/associations/react`. Both render roots + indented children and show `Parent / Child` when selected. 🚨 **BOTH TAKE NEW INPUT** — type a name that does not exist and they offer `Create "…"` (org-scoped via the identity port's `ensureOrgId`). `CategorySelect` is THE category control for the whole app: pass `dimension` and it works. Never fork a per-feature copy, and never turn `allowCreate` off without a reason a user would accept. |
| **Types**     | `PlatformCategory` / `CategoriesEntry` / `CategoryDimension` re-exported from the package via `types.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                      |

### Category is the noun; association is the verb

**ASSIGNING a category to an entity is NOT a category concern — it reuses the association edge.** `category` is already a valid `AssociationTargetType`, so tagging is `useAssociations(...).add({ targetType: 'category', targetId })`. There is **no category-assignment table** and never will be. `categoriesService` owns the category nouns; `associationsService` owns the assignment edges.

### Data path — PUBLIC SECURITY-DEFINER RPCs

The frontend primitive uses only five RPCs: `cat_list(p_dimension?)`, `cat_create(...)`, `cat_update(...)`, `cat_reparent(...)`, and `cat_delete(...)`. `cat_list` returns public system + accessible-org rows. `cat_create` always creates an org-owned `is_system=false` row. Update/reparent/delete require org access; system rows require super-admin. `cat_delete` is a soft delete and refuses a parent with live children. System seeds remain migrations, never client creates. Schema/RPC record: `migrations/category_two_level_primitives.sql`; generated contract: `types/database.types.ts`.

`web_entity_type` is the first product dimension intentionally authored as category + subcategory (8 roots, 34 children). The same primitive applies to every dimension; no CRM-local tree exists.

---

## Neighbours

- The entity vocabulary is **generated** from `platform.entity_types`
  (`pnpm gen:entity-types`), never hand-maintained. `features/scopes/docs/scopeable_entities.md`
  — a 2026-era hand-written "working list" naming tables that no longer exist — was deleted
  2026-08-25; do not re-create one.
- Legacy scope surfaces awaiting teardown: `features/scope-system/`, `features/agent-context/`.
  The teardown order and delete list are in the node's `HANDOFF.md`.
- [`features/agent-context/FEATURE.md`](../agent-context/FEATURE.md) — the invocation-time consumer.
- [`features/sharing/FEATURE.md`](../sharing/FEATURE.md) — permissions cross-cut scope; they are
  not the same axis.

## Change Log

- 2026-09-11 — **B-7 fix round 1** (independent verification V-7). `list_scopes`, `get_scope_tree`
  and `search_scopes` were handing a non-creator member the **complete row** of a `personal` scope —
  name, slug, visibility, `created_by` — in the same breath as the table gave them 0 rows; all three
  now filter on `context._readable_scope_ids()` (measured: the personal scope goes from PRESENT to
  absent for the member, stays PRESENT for the creator, totals 15→14 with only that one removed, and
  **zero** (member, org) pairs platform-wide lose a scope). The guard's class test was a substring
  match a comment defeated, and is now structural: `context.scope_door_registry` plus a call-shaped
  test on the body with comments, literals and dollar-quoted blocks stripped — proven RED on all four
  decoy routes. `set_context_value` no longer tells a user who cannot view the record that they can
  view it (one function, `context._scope_denial_message`, chooses both sentences).

- 2026-09-11 — **B-7: the scope access membrane.** The leak was never in the table policy
  (`context_item_values_select`'s subquery over `context.scopes` is itself RLS-filtered, so a
  `personal` scope's values already went from 37 visible to 0). It was in the `SECURITY DEFINER`
  door: 59 DEFINER functions read the scopes tables and **zero** called `iam.has_access('scope', …)`.
  The eight that serve cell values now go through `context._assert_scope_readable` /
  `_scope_readable` / `_scope_readable_for`, and `context.context_item_values` is registered as a
  component of `scope` on the generated lane. That also closed the mirror-image defect: a real
  `viewer` grant used to open the record and hand over **0** values and **0** field labels — it now
  conveys all 37, while the grantee's DELETE affects 0 rows. `anon`'s SELECT/INSERT/UPDATE/DELETE
  grants on the values table were revoked. Byte parity proven on `get_scope_context` across all 15
  readable scopes, both lanes. Guard: `pnpm check:scope-access-membrane`, proven RED on four
  injected regressions then GREEN. Rule 11 above; `migrations/ctx_scope_access_membrane_b7.sql`.

- 2026-09-10 — **DC-009: local entity-types re-export shim deleted.** Every importer now imports
  `@ai-matrx/associations` directly; the vocabulary paragraph above no longer names a local file.

- 2026-08-30 — **QA F1 (feedback 35d311a9): scope-type Resources attach fixed at the DB
  root cause.** Every attach to a `scope_type` container 403'd (then 23514'd): (1)
  `platform.entity_row_access_attrs` dropped `organization_id` for tables with no
  ownership columns (context.scope_types), so membership access never applied — new
  org-only resolver branch in `migrations/entity_access_attrs_org_scoped_ownerless_tables.sql`;
  (2) zero `* -> scope_type` pairs existed in `platform.association_types` — 14 registered
  non-conveying in `migrations/scope_type_association_pairs.sql` (conveyance stays a human
  decision). Host file-picker override (`host/associationsHostPortsImpl.tsx`) no longer
  swallows failed attach/detach — it toasts, matching the package's generic list scream;
  regression test `host/__tests__/fileAssociationPicker.test.tsx`.
- 2026-08-30 — **Address canonicalization (marketing key-system back-port)**: the org
  scope tree now has exactly ONE canonical address per screen. `canonicalizeScopePath`
  (`lib/scopeRoutes.ts`, tested) + `ScopeAddressCanonicalizer`
  (`features/scope-system/components/`, mounted in the `[orgId]` layout) rewrite a UUID
  org / type / scope / item segment to its slug in one `router.replace`, preserving the
  deep path and query. `/scopes/s/[scopeId]` now redirects to slug segments instead of
  raw ids (each falling back to its id). No data-shape, RLS or not-found change — the
  scope read still alone decides 404, and the two decorative slug reads never gate.
- 2026-08-30 — The global Supabase diagnostic boundary keeps the handled
  `assoc_add` non-conveying-edge `42501` authorization verdict local and
  non-persisting; unrelated association permission failures remain red.
- 2026-08-30 — **Comments adoption (0.5.0 W6, C9)**: `features/comments/` DELETED;
  the `cmt_*` chokepoint is `@ai-matrx/associations/core` bound at
  `service/commentsService.ts`; `CommentThread`/`useComments` are the canonical
  comment UI (tasks panel/editor/popover swapped); `authorDisplay` port bound on
  the provider; `cmt_add` tap on the host dataSource carries the task
  comment-added notification.
- 2026-08-30 — Demanded-schema probe answers no longer file production repair incidents:
  only the package's exact impossible sentinels are local/non-persisting; ordinary RPC
  failures stay red.
- 2026-08-30 — Pattern Patrol P13: quick-assign's four existing-record pickers
  retain their cascade/reset behavior and now expose selected-record doors plus
  canonical owner/create doors with the shared 44px touch-target floor; no second
  organization or scope writer exists.
- 2026-08-29 — **Associations W5 supervised swap (C20/C9)**: the whole
  association/category/favorites/titles system now runs on
  `@ai-matrx/associations@latest`. Flipped: the seven hooks (re-exports of
  `/react`), the faces incl. `AssociationEntitySelect`/`CategorySelect`/
  `CategoryTagPicker` (import sites → the package; local originals DELETED),
  the generated entity-token vocabulary (654 tokens; the app file is a
  re-export, `gen/check:entity-types` now diff the INSTALLED package against
  the live DB). New host binding under `host/` (store singleton, errorSink →
  Error Inspector `associations` source, `AssociationsProvider` mount in
  `app/Providers.tsx` with the five UI ports, dev-only `assertDemandedSchema`
  probe). Deleted (C9): the Redux association/category cache fragments
  (slice reducers + thunks + selectors, ~530 lines), the ported service
  implementations (services became thin host wiring over `/core`),
  `associationHelpers.ts` (zero callers), the local registry merge engine
  (`entityRegistry.ts` now delegates; `ENTITY_OVERLAY` + content-role chrome
  stay host material). `attach-resource.ts` (agents) rewired onto the package
  store. Known delta: the packaged capture toolbar has no "Add document"
  (pick-existing) chip — it was a strict subset of the universal picker.
- 2026-08-29 — Lane F W6–W8 (context-core teardown): the eight `notYetImplemented`
  mutation stubs in `scopesService` are real implementations over the live
  SECURITY DEFINER RPC family (create/update/delete scope type + scope,
  `create_context_item`, `apply_template` — all verified live: definer,
  org-authz inside, authenticated EXECUTE), plus two NEW doored RPCs
  `update_context_item` / `delete_context_item`
  (`migrations/ctx_context_item_update_delete_rpcs.sql`, §6d-4 door + ledger).
  New mutation thunks (`scopeTreeMutations` / `contextItemMutations` /
  `applyTemplate`) patch the canonical tree directly. `ScopesManager` rewired
  onto `ensureScopeTree` + `makeSelectScopeTypesForOrg` with canonical rebuilds
  of `OrgScopeTypeSection`, `NewScopeInline`, `EditScopeTypeSheet`,
  `AddScopeModal`, `ScopeOnboarding`, `TemplateGalleryDrawer` under
  `components/management/`; `ContextAssignmentField`'s quick-add now uses the
  canonical `createScope` thunk. `slugify`, `scopeValuePayload`,
  `ScopeColorPicker`, `ReorderDialog` moved into this unit. Templates catalog
  read enriched with nested scope-type/field detail. **Zero
  `features/scope-system` / `features/agent-context` imports remain anywhere in
  `features/scopes` — the last 8 of 29 legacy back-edges are gone.**
  (`revertContextValue` / `deleteContextValue` stay stubs — their RPCs do not
  exist yet.)
- 2026-08-29 — Associations-extraction W0 prereqs: `AttachedItemsSheet` title resolution
  repointed onto the unit's `service/entityTitles.ts` (sharing's `accessSummary.fetchEntityTitles`
  copy is dedup-flagged for the sharing node); in-unit `cn` imports unified on `@/utils/cn`;
  new `service/favoritesCore.ts` — the client-injectable `ues_get_bulk` implementation —
  closes the one bare `ues_*` caller outside this service directory
  (`features/ai-work/service/providerConversation.ts`, a server-component reader).
- 2026-08-29 — `conversation_files` now authorizes the actual `chat.conversation`
  row through `can_view_chat_conversation`; it never routes a chat UUID through
  the legacy `conversation` entity token registered to `public.cx_conversation`.
- 2026-08-29 — Quick-assign (target picker + `useSetContextValue`) rewired off the legacy
  scope-system slices onto canonical paths: new `ensureScopeTypeItems` thunk +
  `contextItemsByTypeId` catalogs on `scopesSlice`, new `setContextValue` write thunk over the
  `set_context_value` RPC folding into `contextValuesSlice` (Lane F W4–W5).
- 2026-08-28 — Repaired the DB-wide definer-grant guard's search-path-dependent grandfather
  identity so scope RLS keeps authenticated EXECUTE on `iam.has_access` across unrelated DDL.
- 2026-08-28 — Classified the bounded Supabase upstream-connect/reset-before-headers response as
  transport noise while preserving loud Postgres/PostgREST failures.
