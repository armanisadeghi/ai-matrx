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

- `/marketing/content-plan?site=<web.site id>&view=setup|tree|table|map|entities` — the
  workspace (`app/(core)/marketing/content-plan/page.tsx`). Header chrome (site picker, view
  switch, refresh) injects into the shell PageHeader
  (`components/ContentPlanHeader.tsx`); state rides the URL
  (`hooks/usePlanWorkspaceParams.ts`).
- Nav: Marketing Hub → "Content Plan" (`features/shell/constants/nav-data.ts`).
- `data/service.ts` — THE plan write path on the client. Every entrance
  (UI, future envelope-apply, generators) delegates here; nothing else calls
  `supabase.schema("plan")`.
- `setup/` — the Site Setup view (`?view=setup`): the archetype twin
  (`archetypes.ts` + its pinning fixture), the library/work-order/commit service,
  the readiness checklist, the route-preview diff, and the three columns. Its
  writes go through `data/service.ts#createPlanNode` like everything else.
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
   no-op; the DB trigger stays the authority. List management rides a
   compact toolbar (`PlanTreeToolbar.tsx`; pure logic in
   `lib/tree-view.ts`): search over label/route/slug (matches keep their
   ancestors, non-matching ancestors render dimmed — shared
   `filterWithAncestors` from `pillar-map/layouts.ts`), one filter popover
   (status multi + type multi + keyword coverage + needs-reviewer, counts on
   every option, active-count badge, clear-all), sibling-level sort (tree
   order / label / priority / status pipeline order / recently updated —
   never flattens the hierarchy), expand/collapse all, the
   Pillars/Clusters/All level control (Pillars = the top-level overview,
   computed from VISUAL depth so pillar-as-root plans work), collapsed rows
   carry a descendant-count badge, and a live "N pages" / "M of N" count.
   Home + pillar labels render semibold. While a search/filter is active the
   collapse set is bypassed so every match is visible; all of it is
   client-side over the already-loaded plan.
1b. **Table view** (`PlanNodesTable.tsx`, `?view=table`): every planned URL
   as one `MatrxDataTable` row — CONTROLLED mode over the canonical local
   engine (`filterAndSortRows`) since the plan is fully client-loaded.
   Columns: Label, Route (mono), Type, Status (dot + name), Priority,
   Keyword (Bound/Missing), Pillar, Cluster, Depth, Reviewer
   (default-hidden), Updated — every column sorts AND filters; finite
   columns get real option lists with counts (status options in pipeline
   order). Full-row click opens the node in the SAME NodePanel right sheet
   the map uses (built-in inspector/window off — one detail surface).
   Style persists via `useListViewPrefs("content-plan-nodes")` (sort,
   direction, page size, hidden columns via the toolbar Columns picker;
   bump its `version` when columns change); search/filters/page never
   persist. Hiding a column drops its live filter/sort with it.
2. **Node panel** (`NodePanel.tsx`): label/slug/type, page-type + status
   category pickers, priority, technical depth, needs-reviewer, brief
   (line-per-bullet), vertical attributes (schema-driven,
   `AttributesEditor.tsx`), primary keyword (`KeywordPicker.tsx` — searches
   `seo.keyword`, displays THIS site's `seo.site_keyword_value`
   workflow/role/priority; the plan reads keyword value, never re-decides
   it), topics / secondary keywords / entity attachments
   (`NodeAssociations.tsx`).
3. **Pillar map** (`PillarMap.tsx` + `pillar-map/`, React Flow, code-split
   behind the view switch with `ssr:false`): three user-switchable pure
   layouts (radial orbit / tidy tree / pillar columns — `pillar-map/layouts.ts`,
   unit-tested; choice persists in localStorage). Every dimension encoded
   (legend toggle): color = status, shape = node_type, size = priority,
   dashed outline = needs_reviewer, corner dot = primary keyword. Scale:
   double-click a pillar/cluster collapses its subtree into a count-badged
   super-node; semantic zoom hides article/cluster labels far out; filters
   (status/type/pillar/keyword coverage/reviewer/technical depth) keep
   ancestors visible but dimmed. Click = open node panel; drag a node onto
   another = real reparent; box-select (shift-drag) = bulk status change.
   Positions are a projection, never persisted.
3b. **Site Setup** (`setup/`, `?view=setup`): go from nothing (or half a plan)
   to a structured site plan in minutes, never writing a page the user has not
   seen first. Three columns left to right — **Shape** (the archetype library:
   platform builtins on the system-org `plan.profile`
   `vertical='platform-archetypes'`, merged with the site org's own, org
   shadowing a builtin key and SAYING so), **Counts** (per-family steppers plus
   "Name them": paste the client's real service list one per line and it sets
   the count AND rewrites the slugs live), **the exact routes** then commit.
   It is a PERSISTENT readiness surface, not a day-zero wizard — the same
   screen answers "what is missing?" on an empty site, a half-built one, and a
   finished one, and re-running it is safe.
4. **Entities** (`EntityManager.tsx`): `plan.entity` CRUD per site.
5. **Agent writes** land directly in the DB (chat tools today, aidream
   generator later) and appear on refetch — the header Refresh invalidates
   `planKeys.all`.

## Invariants & gotchas

### Site Setup — the three rules that make it correct

- **ONE identity, shared by the preview and the writer:** the DB's own unique
  index `node_site_parent_slug_key (site_id, parent_id, slug) NULLS NOT
  DISTINCT`, resolved parent-first down the tree (`setup/service.ts#identityKey`,
  consumed by both `setup/preview.ts` and `commitArchetype`). Diffing by route
  while writing by (parent, slug) disagrees in exactly the case that matters —
  a page already living at that route under a DIFFERENT parent. The second
  unique index (`node_site_route_key (site_id, route)`) rejects that insert, so
  the preview flags it **`conflict` BEFORE commit** instead of surfacing it as a
  post-commit failure. Never reintroduce a route-keyed diff.
- **The archetype expander is a TWIN of aidream's canonical
  `services/content_plan/archetypes.py`,** pinned by the language-neutral
  fixture `setup/archetype-expansion-cases.json` (copied verbatim from aidream,
  which owns it) and the runnable guard **`pnpm check:archetype-expansion`**
  (20 cases + a checksum against aidream's copy; aidream runs the same cases in
  `tests/test_archetype_expansion_fixture.py`). Behaviour changes go: fixture in
  aidream → copy here → fix the twin. **Never edit the fixture to make the twin
  pass.** Two canonical behaviours it pins that are easy to get wrong: an
  unrecognised `node_type` COERCES to `article` loudly (it does not refuse —
  refusing would preview nothing for a tree the chat tool happily writes), and
  unknown config keys are REJECTED (the canonical models are `extra="forbid"`).
- **The committed work order lives in ONE place:**
  `web.site.settings.content_plan.archetype = {key, counts, instantiated_at}` —
  byte-identical to what aidream's `_record_site_archetype` writes, MERGED into
  the `content_plan` block that already carries `vertical`, and guarded by the
  row's `version`. Nothing extra is stored beside it. In particular **child
  NAMES are not persisted** — they are re-derived from the live plan's own child
  labels (`namesFromPlan` in `setup/components/SetupView.tsx`, adopting only
  children whose label round-trips to their slug), which is what makes
  re-opening Setup idempotent without a second source of truth.

### General

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
- `features/marketing/seo/keyword-research` — canonical keyword search read.
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

- 2026-07-28 — Claude: **Site Setup (`?view=setup`) — the fifth view**, merged
  from a four-way UI bake-off (`create-{sharp,reimagine,refine,dense}`, all four
  now deleted). Refine's three-column feel and mobile treatment; dense's
  correctness (shared `(parent_id, slug)` identity → `conflict` before commit,
  `count_only`, a failure report that survives re-render); reimagine's "Name
  them" paste box and its module-level pure expander (a `let` in a try/catch is
  untracked by the React Compiler and committed pre-rename routes); sharp's CMS
  foundation readiness measured against the real `client_sites` row. The three
  questions all four punted are settled and written up under Invariants: the
  archetype port is now ONE twin pinned to aidream by a shared fixture +
  `pnpm check:archetype-expansion`; the committed shape stays on
  `web.site.settings.content_plan.archetype` matching the server; child names
  are re-derived from the plan rather than stored twice. Also fixed on the way
  through: `CmsSiteService.listSites()` returned a summary while typed
  `ClientSite[]` (new `ClientSiteSummary`), which had been silently reporting
  "no theme, 0 nav entries" and `has_data_api_key: false` platform-wide; and the
  header view switcher now scrolls instead of crushing its buttons at 375px.
  Live-verified on datadestruction.com (empty → commit → idempotent re-run →
  planted route collision shown as `conflict` → linked-CMS foundation state),
  read-only on prpinjectionmd.com (293 nodes); all test rows removed.
- 2026-07-26 — Claude: **list-management layer** — tree toolbar
  (`PlanTreeToolbar.tsx` + pure `lib/tree-view.ts`): search with dimmed
  ancestors, status/type/keyword/reviewer filter popover with counts +
  badge, sibling-level sort (tree/label/priority/status-pipeline/updated),
  expand/collapse all + Pillars/Clusters/All level control,
  descendant-count badges on collapsed rows, node counts; new fourth view
  `?view=table` (`PlanNodesTable.tsx` on `MatrxDataTable`, every column
  sorts+filters with counted options, full-row click → NodePanel sheet,
  style persisted via `useListViewPrefs("content-plan-nodes")`); `PlanView`
  extended in the params hook, header switcher, and the surface manifest's
  `view` union/description (DB mirror description not re-synced). All
  client-side over loaded data; drag-reparent, draft overlay, mobile sheets,
  resizable panels unchanged.
- 2026-07-26 — Claude: **usability overhaul of the workspace UI** (no behavior
  changes). Tree|panel split is now a cookie-persisted resizable
  `react-resizable-panels` group (`panels:content-plan`, read server-side in
  `page.tsx`; same `ClientGroup`/`Handle` pattern as `/tasks`) — the fixed
  380px sidebar is gone. Tree rows are two-line (full label, full route in
  mono below — page names/routes never truncate) with a high-contrast
  selected state (primary wash + 2px left rail + heavier weight) distinct
  from hover. Node panel restructured into labeled sections (Page /
  Placement / Targeting / Brief + attribute/association sections) with one
  field-label and section-header grammar; primary content is
  `text-foreground` everywhere, `text-muted-foreground` reserved for
  genuinely secondary metadata. Entities view redesigned (centered card
  list, readable names, type badges, real empty state + skeleton loading);
  entity dialog and NewNodeDialog labels tidied; node types humanized via
  `NODE_TYPE_LABELS`. Skeletons replace bare "Loading…" text. PillarMap
  untouched.
- 2026-07-26 — Claude: **Content plan header gets working-context chip** —
  `ActiveContextLensChip` (same as `/chat`) sits left of the site picker in
  `ContentPlanHeader`; writes global app context only, never local plan state.
- 2026-07-26 — Claude: pillar map redesigned for 400+ nodes — 3 switchable
  pure layouts (`pillar-map/layouts.ts` + tests), full dimension encoding
  (shape/color/size/outline/badge) with legend, collapse/expand super-nodes,
  semantic-zoom labels, ancestor-dimming filters; props interface unchanged.
- 2026-07-26 — Claude: **Site picker lists every RLS-visible site** (active org
  first). Filtering to active-org-only hid sites like `prpinjectionmd.com`
  (Titanium) when the shell org was something else — plans applied fine, the
  dropdown just couldn't reach them. `?site=` orphans stay in the list.
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
