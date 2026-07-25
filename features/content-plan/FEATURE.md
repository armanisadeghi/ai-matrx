# Content Plan (client)

**Status:** active
**Tier:** 1
**Last updated:** 2026-07-25

## Purpose

The client workspace for the `plan` schema — every URL a site *should* have,
as an editable tree (pillars → clusters → articles) with briefs, keyword
bindings, topics, and the people/sources behind the content (E-E-A-T). The UI
is for **seeing, deciding, and correcting — agents do the bulk writing**;
every visual element is actionable (drag = real reparent, click = edit,
color = live status). This is a product for orgs planning for the brands they
manage — org-scoped, no internal-only assumptions.

**Cross-repo system of record:** `common-docs/systems/content-planning/FEATURE.md`
(DB truth, invariants, rollout). Server work (plan generation, brief
deepening, crawl reconciliation) is aidream's — this feature never routes
plan CRUD through it.

## Entry points

- `/content-plan?site=<web.site id>&view=tree|map|entities` — the workspace
  (`app/(core)/content-plan/page.tsx`). Header chrome (site picker, view
  switch, refresh) injects into the shell PageHeader
  (`components/ContentPlanHeader.tsx`); state rides the URL
  (`hooks/usePlanWorkspaceParams.ts`).
- Nav: Marketing Hub → "Content Plan" (`features/shell/constants/nav-data.ts`).
- `data/service.ts` — THE plan write path on the client. Every entrance
  (UI, future envelope-apply, generators) delegates here; nothing else calls
  `supabase.schema("plan")`.
- `data/associations.ts` — plan edges via the canonical
  `associationsService` (assoc_add/assoc_remove RPCs); never a parallel path.
- `data/hooks.ts` — TanStack Query hooks (`planKeys.*`).
- Surface: `matrx-user/content-plan`
  (`features/surfaces/manifests/content-plan.manifest.ts`; route mapping in
  `features/surfaces/utils/route-to-surface.ts`). The workbench mounts
  `SurfaceRuntimeProvider` and emits declared values at trigger time via
  `lib/content-plan-scope.ts` (`buildContentPlanScope`) — already-loaded query
  data only, never a fetch. Only `view` is `alwaysAvailable` (site identity
  rides `?site=`, not a routed segment).

## Data model (all live in Supabase, PostgREST-exposed)

- `plan.node` — planned URL tree. **`route` / `depth` / `pillar_label` /
  `cluster_label` are TRIGGER-OWNED derived cache** (`plan._node_shape` +
  `_z_node_cascade`); `types.ts` omits them from the Insert/Update types so a
  client write is a compile error. `organization_id` is stamped from the
  site by the DB guard.
- `plan.entity` — person/source/media/org per site.
- `plan.profile` — vertical config (attribute schemas, cadences, template
  maps) per org. **No hard site→vertical binding exists yet** (open item in
  the system-of-record doc) — the attributes editor offers an explicit
  profile picker, auto-selecting when the org has exactly one.
- Categories: dimensions `plan_page_type` / `plan_status` /
  `plan_person_role` / `plan_source_type` (system seeds, `visibility='public'`
  since `plan_seed_categories_public.sql`) via the canonical `useCategories`.
- Associations (registered pairs): node→topic (`topic`), node→keyword
  (`secondary_keyword` — the PRIMARY keyword is the `primary_keyword_id` FK,
  never an edge), node→entity (`about`/`cites`/`embeds`/`authored_by`/
  `reviewed_by`; reviews carry the schema-validated `plan_review` payload).
  The `plan_node|plan_entity → web_site` containment edge is written by the
  DB trigger `plan._site_edge` — the client NEVER writes it.

## Key flows

1. **Tree editing** (`PlanTree.tsx`): flattened indented rows, dnd-kit
   drag-onto-row = reparent (ONE `parent_id` write; the DB recomputes the
   whole subtree — the client refetches, it never computes). Drop on the
   root strip = top-level. A cheap client cycle pre-check skips the obvious
   no-op; the DB trigger stays the authority.
2. **Node panel** (`NodePanel.tsx`): label/slug/type, page-type + status
   category pickers, priority, technical depth, needs-reviewer, brief
   (line-per-bullet), vertical attributes (schema-driven,
   `AttributesEditor.tsx`), primary keyword (`KeywordPicker.tsx` — searches
   `seo.keyword`, displays THIS site's `seo.site_keyword_value`
   workflow/role/priority; the plan reads keyword value, never re-decides
   it), topics / secondary keywords / entity attachments
   (`NodeAssociations.tsx`).
3. **Pillar map** (`PillarMap.tsx`, React Flow, code-split behind the view
   switch with `ssr:false`): deterministic radial projection of the same
   tree. Click = open node panel (right sheet); drag a node onto another =
   real reparent; box-select (shift-drag) = bulk status change; filters by
   status/pillar. Positions are a projection, never persisted.
4. **Entities** (`EntityManager.tsx`): `plan.entity` CRUD per site.
5. **Agent writes** land directly in the DB (chat tools today, aidream
   generator later) and appear on refetch — the header Refresh invalidates
   `planKeys.all`.

## Invariants & gotchas

- **DB trigger errors are the contract.** Brandless site, slug shape,
  duplicate route, cross-site parent, cycle — surfaced verbatim inside a
  friendly toast (`toast` from `@/lib/toast`, captured). Never mask, never
  work around, never precompute to avoid them (except the free cycle
  pre-check, which changes nothing about authority).
- **Never write `route`/`depth`/`pillar_label`/`cluster_label`** — enforced
  at the type level (`PLAN_NODE_TRIGGER_OWNED` in `types.ts`).
- **Every node mutation invalidates the whole site node list** — the cascade
  may have touched any descendant.
- Node soft-delete refuses while live children exist (names the fix).
- A brandless site shows a loud banner; node creation against it gets the
  DB's own error message. Don't pre-hide the site from the picker — the
  error + "assign a brand" pointer IS the flow.
- Sibling ordering: `plan.node` has no sort column — trees order by `route`.
  Drag is for REPARENTING, not sibling reordering.
- `updated_at`-reset draft: the node panel's local draft resets when a
  fresher row arrives (`node.id`+`node.updated_at` key), so background
  refetches never silently clobber typing with stale values.

## Related features

- `features/marketing` — `useSiteOptions` (site picker), brand assignment.
- `features/seo/keyword-research` — canonical keyword search read.
- `features/scopes` — canonical associations + categories services/hooks
  (this feature added the `plan_*` dimensions to `CATEGORY_DIMENSIONS` and
  `plan_entity`/`seo_topic`/`seo_keyword` to `ASSOCIATION_TARGET_TYPES`).

## Doctrine compliance

- Reused: `associationsService`, `useCategories` + `cat_list`,
  `listKeywordsWithMarket`, `useSiteOptions`, marketing's
  `assertData`/`assertFound`/`assertMutated`, generated `Database["plan"]`
  types, shadcn primitives, `ConfirmDialog`, `toast` (captured), dnd-kit,
  React Flow, `convertToKebabCase`.
- Introduced: the `plan`-schema service layer + view components. No new
  Redux slice (server data via React Query, view state in the URL — same
  pattern as `features/marketing`). No barrels.

## Change log

- 2026-07-25 — Claude: **agent-write path live end-to-end** — plan_tree /
  plan_node_patch envelopes (applied server-side by aidream; receipts render
  via `features/matrx-envelope/directives/planTree/`, resolving through THIS
  feature's read service — the client never applies). Adversarial-review
  fixes: brief textarea raw-text draft (spaces/blank lines typed normally),
  NodePanel keyed by node id + draft survives background refetches,
  controlled React Flow (`onNodesChange`; drop detection on live positions),
  org-scoped site auto-select only (stale `?site=` still resolves), bulk
  status single-pass + one invalidation, entity dialog remounts per open,
  >10k-node loud cap, late-bound status default, canonical error/type
  narrowing, dead exports removed.

- 2026-07-25 — Claude: surface manifest `matrx-user/content-plan` (21 values,
  5 curated groups, 3 agent roles), runtime emitter in the workbench
  (`lib/content-plan-scope.ts`), `/content-plan` route→surface mapping, DB
  mirror synced (`ui.ui_surface` + values + roles verified live).

- 2026-07-25 — Claude: initial build (Phase 1 of the content-planning
  rollout): tree editor + node panel + keyword/topic/entity attachment,
  pillar map, entity manager, `/content-plan` route + nav. DB follow-up
  migration `plan_seed_categories_public.sql` (plan seed categories →
  `visibility='public'`; `cat_list` now honors public rows — they were
  invisible to every non-system-org user).
