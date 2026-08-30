# FEATURE.md — `features/scopes` (LOCAL MECHANICS ONLY)

> Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/scopes-context/STATE.md — read it before touching this feature in ANY repo.

**The model, the invariants' rationale, the data model, the resolution contract, the delivery
path, the migration status and the change history are NOT in this file** — they were centralized
into the `scopes-context` node kit on 2026-08-25 (`STATE.md`, `DECISIONS.md`, `HANDOFF.md`,
`context-delivery/STATE.md`). What is left here is the code-safety rules and the file map for
this directory.

## 🚨 Rules an agent editing this directory must obey

1. **`scopesService.ts` is the ONLY file that may query the `context.*` tables.** ESLint enforces
   it; the boy-scout rule applies — fix violators on sight. (The tables are `context.scope_types`,
   `context.scopes`, `context.context_items`, `context.context_item_values`, … — the old public
   `ctx_*` names no longer exist.)
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
    downgrade an error carrying a Postgres code or HTTP status.

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
- Routes: `app/(core)/scopes/` (`page`, `manage`, `s/[scopeId]`, `templates`, `settings`) and
  `app/(core)/organizations/[orgId]/scopes/**` (the root page is the canonical
  `ScopesManager`; the deeper per-type/per-scope editors are still legacy
  `features/scope-system/` pending their own teardown wave).

---

## The unified association edge — `platform.associations`

The canonical **"associate ANY entity to ANY entity"** primitive, owned by this module. It replaces scattered `project_id`/`task_id` FK tagging and per-feature M2M tables (`ctx_scope_assignments`, `ctx_task_associations`, …) with **one polymorphic edge table**. Read this before adding any "tag / link / attach this to that" relationship anywhere in the app — extend the edge, never spin up a new M2M table or FK column.

`platform.associations(source_type, source_id, target_type, target_id, organization_id, label, metadata, role, position, created_by, created_at)`. The unique key is the **5-tuple** `(source_type, source_id, target_type, target_id, role)` `NULLS NOT DISTINCT` (`associations_unique`) — any ON CONFLICT must list all five. There is **no CHECK constraint** on the type columns; the only DB gate is the **validated FK** `source_type`/`target_type → platform.entity_types.token`, so any registered token is accepted as source OR target.

**Entity vocabulary is GENERATED, not hand-maintained.** `types/generated/entity-types.generated.ts` mirrors `platform.entity_types` 1:1 (217 tokens) via `pnpm gen:entity-types` (reads the public `entity_types_list()` RPC; `pnpm check:entity-types` screams on drift; folded into `pnpm sync-types`). It exports `EntityTypeToken` (the full FK-valid union — use it for any source/target-type argument), the runtime `isEntityTypeToken` guard + `ENTITY_TYPE_TOKENS` set, `ENTITY_TYPE_METADATA`, and curated subsets. `AssociationTargetType` (`types.ts`) is a curated "deliberate container" list proven valid at compile time with `satisfies readonly EntityTypeToken[]` — it can never drift to an unregistered token. The legacy hand-written `EntityType` union persists for existing scope-tag/favorites consumers and is converging onto `EntityTypeToken` (do not extend it — add tokens to the registry + regenerate). KNOWN HOLE: `agent_app` is in `EntityType` but is NOT a registered token (no `aga_apps` table) — a `source_type='agent_app'` write FK-violates; tracked for the association-cleanup pass.

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

| Layer         | What |
| ------------- | ---- |
| **Service**   | `@ai-matrx/associations/core` `createCategoriesService` — the sole `cat_*` chokepoint, re-exposed as `service/categoriesService.ts` (thin host wiring). No other file may call those RPCs. |
| **Hook**      | `hooks/useCategories.ts` — a re-export of `@ai-matrx/associations/react` `useCategories({ dimension })`, same signature. Components never touch the store or service directly. |
| **Cache**     | The package store's category facets (echo-insert on create preserved). The Redux `categoriesByDimension` fragments were DELETED in the W5 swap. |
| **Hierarchy** | `utils/categoryHierarchy.ts` — the one two-level ordering/path resolver (host-local; the packaged pickers ship their own). Flat input returns in the exact original order; malformed/orphaned rows stay visible. |
| **Pickers**   | `CategorySelect` (one value) + `CategoryTagPicker` (many) ship in `@ai-matrx/associations/react`. Both render roots + indented children and show `Parent / Child` when selected. 🚨 **BOTH TAKE NEW INPUT** — type a name that does not exist and they offer `Create "…"` (org-scoped via the identity port's `ensureOrgId`). `CategorySelect` is THE category control for the whole app: pass `dimension` and it works. Never fork a per-feature copy, and never turn `allowCreate` off without a reason a user would accept. |
| **Types**     | `PlatformCategory` / `CategoriesEntry` / `CategoryDimension` re-exported from the package via `types.ts`. |

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

- 2026-08-30 — The global Supabase diagnostic boundary keeps the handled
  `assoc_add` non-conveying-edge `42501` authorization verdict local and
  non-persisting; unrelated association permission failures remain red.
- 2026-08-30 — **Comments adoption (0.5.0 W6, C9)**: `features/comments/` DELETED;
  the `cmt_*` chokepoint is `@ai-matrx/associations/core` bound at
  `service/commentsService.ts`; `CommentThread`/`useComments` are the canonical
  comment UI (tasks panel/editor/popover swapped); `authorDisplay` port bound on
  the provider; `cmt_add` tap on the host dataSource carries the task
  comment-added notification.
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
