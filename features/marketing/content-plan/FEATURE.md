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

- `/marketing/content-plan` — the LIST page and the feature's front door
  (`app/(core)/marketing/content-plan/page.tsx` → `components/PlanSitesList.tsx`):
  every RLS-visible site as a canonical entry-list row with live plan
  aggregates (pages, status mix, keyword coverage, last activity — one
  `listPlanSiteStats` sweep), per-row ItemMenu (open any view / Setup / the
  marketing site record), `useListViewPrefs("content-plan-sites")`. Row click
  opens the workspace (a no-plan site lands on Setup). Legacy `?site=` URLs
  server-redirect. Header: `components/ContentPlanListHeader.tsx`.
- `/marketing/content-plan/[siteId]?view=setup|tree|table|map|entities` — the
  workspace (`app/(core)/marketing/content-plan/[siteId]/page.tsx`). The site
  is a ROUTED segment; only the view rides the query. Header chrome
  (back-to-plans link, site picker, view switch, refresh) injects into the
  shell PageHeader (`components/ContentPlanHeader.tsx`); state rides the URL
  (`hooks/usePlanWorkspaceParams.ts`).
- AI actions (`hooks/useContentPlanAi.ts`) — Generate plan (`PlanGenerateBar`
  strip on tree/table/map, streams `/content-plan/sites/{id}/generate`) and
  Deepen (NodePanel header button, streams `/content-plan/nodes/{id}/deepen`).
- **Setup step agents (`setup/ai.ts`)** — every Setup step has a real AI,
  grounded in the RESEARCH system's final report (the "Document",
  `research.rs_document.content`, picked by topic in the `SetupAiBar` strip):
  the **Content Plan Shape Planner** (`b600975c-…`, archetype + counts +
  concept names) and the **Content Plan Family Namer** (`7a16db8c-…`, real
  page names for one family — services, locations, guides). Both are platform
  agents (agx, created via the AI Dream MCP) with json_schema output, run
  HEADLESS through `launchAgentExecution` + JSON extraction (the
  useGenerateQuiz pattern). Results stage into the view's own setters — the
  USER commits. The `site_shaper` surface role is bound to the Shape Planner
  (manifest + `ui.ui_surface_agent_role`).
- Plan↔CMS bridge (`setup/bridge.ts`, consumed by
  `setup/components/SetupBridgeSection.tsx`) — the OTHER sanctioned aidream
  calls: `POST /content-plan/sites/{id}/cms-reconcile | cms-align |
  cms-starter-kit`. Guarded CMS writes (agent_write_policy + activity log live
  server-side), never DB reads. Everything else stays Supabase-direct.
- Nav: Marketing Hub → "Content Plan" (`features/shell/constants/nav-data.ts`).
- `data/service.ts` — THE plan write path on the client. Every entrance
  (UI, future envelope-apply, generators) delegates here; nothing else calls
  `supabase.schema("plan")`.
- `setup/` — the Site Setup view (`?view=setup`): the archetype twin
  (`archetypes.ts` + the concept library `concepts.ts` + their pinning fixture),
  the library/work-order/commit service, the readiness checklist, the
  route-preview diff, and the three columns. Its writes go through
  `data/service.ts#createPlanNode` like everything else.
- `data/associations.ts` — plan edges via the canonical
  `associationsService` (assoc_add/assoc_remove RPCs); never a parallel path.
- `data/hooks.ts` — TanStack Query hooks (`planKeys.*`).
- Surfaces: **FIVE**, because `?view=` is a different page with different
  agents (manifests in `features/surfaces/manifests/content-plan*.manifest.ts`;
  route mapping via `resolveMarketingSurface` in
  `features/surfaces/utils/route-to-surface.ts` — list vs `[siteId]` split):
  - `matrx-user/content-plan-list` — the front door (emitter + `open_site`
    ui write target in `PlanSitesList`).
  - `matrx-user/content-plan` — the plan-editor BASE (tree/table/map are
    three projections of one plan) and inheritance parent. Workbench mounts
    the provider (`buildContentPlanScope` over already-loaded query data,
    never a fetch) + the `select_node` ui write target.
  - `matrx-user/content-plan-setup` / `-entities` / `-node` — nested
    providers inside SetupView / EntityManager / NodePanel (deepest wins
    while active), all inheriting the base.
  **`content-plan-node` is the platform's FIRST read/WRITE surface**: 10
  draft-mode field targets (label/slug/type/status/priority/depth/reviewer/
  keyword/brief/attributes stage into the panel draft — the user saves) +
  `save_node` (entity mode). Agent results and kind-component buttons land
  through `applySurfaceWrite` / the `apply_surface_write` kind action —
  read `features/surfaces/FEATURE.md` § Surface writeback before touching
  any of this.

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
   finished one, and re-running it is safe. Under the foundation checklist sit
   the **"Make it real" rungs** (`SetupBridgeSection`): 1 create-or-link the
   CMS counterpart (CMS site via the existing `/api/cms` seam, **seeding
   `settings.agent_write_policy: "full"` — an unset policy is `blocked` and
   every later rung writes through aidream's policy-guarded seams**; link
   recorded on BOTH sides — `web.site.settings.cms` merge-write + the bridge
   pairing via the first `cms-reconcile`), 2 run the starter kit (refusal on a non-empty
   site surfaces verbatim; force only behind a destructive confirm), 3 realize
   planned pages (reconcile report → **dry-run preview mandatory before
   apply**; per-item results shown verbatim — the bridge isolates per item, so
   partial success is reported as exactly that), 4 **generate content from
   briefs** (`POST /content-plan/sites/{id}/cms-fill[/preview|/status|/cancel]`
   — aidream's DURABLE fill pipeline: `plan.cms_fill_job/_item` DB frontier,
   SKIP-LOCKED leases, boot-resume, so a 200-page run survives deploys and the
   rung is restart-agnostic — the section hydrates the latest job on mount and
   polls live queue counts every 2.5s while one runs; **previewing ONE authored
   page is mandatory before fan-out** and renders composed global CSS + header
   + fragment + footer in a sandboxed iframe; failures/dead-letters listed
   verbatim; Stop cancels claiming without killing in-flight pages), 5
   **publish the site** (`POST /content-plan/sites/{id}/cms-publish`,
   2026-07-29 — bulk publish of every pending page through aidream's ONE
   per-page publish path; dry-run preview mandatory, apply behind a
   destructive confirm since this is the rung that changes the LIVE site;
   per-page results + `remaining_candidates` shown verbatim, and linked plan
   nodes advance to `published`).
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
  `services/content_plan/archetypes.py` + `concepts.py`,** pinned by the
  language-neutral fixture `setup/archetype-expansion-cases.json` (copied
  verbatim from aidream, which owns it) and the runnable guard
  **`pnpm check:archetype-expansion`** (62 cases + a checksum against aidream's
  copy; aidream runs the same cases in
  `tests/test_archetype_expansion_fixture.py`). Behaviour changes go: fixture in
  aidream → copy here → fix the twin. **Never edit the fixture to make the twin
  pass.** Two canonical behaviours it pins that are easy to get wrong: an
  unrecognised `node_type` COERCES to `article` loudly (it does not refuse —
  refusing would preview nothing for a tree the chat tool happily writes), and
  unknown config keys are REJECTED (the canonical models are `extra="forbid"`).

- **An archetype is a SELECTION from the concept menu — and BOTH authoring
  forms parse, never mixed.** `plan.profile.template_map` carries two sibling
  keys on the SAME row: `archetypes` and the `concepts` catalog they name
  (`setup/concepts.ts`; one row, because a selection is meaningless without the
  catalog it references). Three layers:
  **concept** (`home`, `about`, `services`, … — a menu row) → **variant** (a
  named composition: either fixed real-named `pages`, which may nest `children`
  to arbitrary depth, or ONE count-bearing `family`) → **selection**
  (`{concept: {variant?, count?, name?, brief?, child_brief?}}` plus `omits`).
  **Count and variant are orthogonal and both optional**; nothing is required
  except `home`. `expandArchetype` resolves a selection into the same
  `core`+`families`+`foundation` shape the explicit form uses, ONCE, at the top
  — so everything downstream (preview, readiness, commit) is unchanged. Rules
  that are easy to break:
  - **Never flatten a variant's nested `children`.** `/about/founder` is a real
    route the CMS serves; flattening silently rewrites the composition the user
    approved. (`about × 3` would emit `/about/about-1`, which is why a variant
    is a composition and not a count.)
  - **Declaring `concepts` AND `core`/`families` raises**, as does
    `omits`/`foundation_overrides` with no `concepts`. Two authorities for one
    tree is how a preview stops matching what lands.
  - **A selection-form archetype has NO `families` until it resolves.** Read
    families off the EXPANSION (`SetupView` expands every shape at its own
    defaults into `baseline`), never off the raw config — reading the config is
    how the counts UI and `namesFromPlan` silently see nothing.
  - **Adding a concept or a variant is DATA.** No `Literal`, no CHECK
    constraint, no component. The twin validates shape only and never
    enumerates concept names.
  - **`omits` is surfaced, not inferred.** What a shape deliberately leaves out
    is half the decision; it is shown on the shape row and in the Concepts
    section. Node provenance (`attributes.archetype.concept` / `.variant`,
    written identically by both sides) says which menu item owns which page.
  - **Naming enums — the slug FOLLOWS the chosen name** (ruled 2026-07-28). A
    concept's `nameOptions` are suggestions; ANY custom name is valid. A pick
    (`ConceptSelection.name` or `expandArchetype`'s `conceptNames`) renames the
    family hub or the variant's single top page AND its slug (`Offices` →
    `/offices`); provenance keeps the canonical concept key; the family KEY
    never changes, so `=<key>.count` keeps resolving. Home renames label-only;
    a multi-top-page variant (legal) rejects a name loudly. The Concepts
    section renders the chips + Custom… input (`ConceptRow` in
    `SetupWorkOrderColumn`).
  - **Hub concepts auto-nest** (ruled 2026-07-28). `Concept.hub = "content"`
    (blog/learn/education) hosts every selected `hubMember = "content"` concept
    (`guides`) via `ArchetypeFamily.parentKey` — ONE level, loud on chains —
    landing `/learn/guides/…`. No hub selected → members stay top-level;
    commercial concepts are never moved. The UI shows a `hub` badge and a
    "Nests under X" note; aidream's generator honors the same placement.
- **Every Setup step SAVES — the work-order DRAFT persists as you go.**
  `setup/draft.ts` autosaves the in-progress choices (selected shape, counts,
  pasted/AI names, concept picks, research topic) to
  `web.site.settings.content_plan.setup_draft` (debounced, version-guarded
  read-modify-write with one retry; a failed save toasts LOUDLY — a silent
  autosave failure is the original twenty-minutes-of-typing-lost bug). The
  draft is a DIFFERENT fact from the committed record (sibling key, never
  merged into `archetype`), seeds the view once per site on open, and is
  cleared on a fully-successful commit. Because draft saves bump the site
  row's `version`, the commit's `recordSiteArchetype` reads the FRESH row
  (`fetchFreshSite`) instead of the query cache's copy.
- **The committed work order lives in ONE place:**
  `web.site.settings.content_plan.archetype = {key, counts, concept_names?,
  instantiated_at}` — byte-identical to what aidream's `_record_site_archetype`
  writes (`concept_names` only when names were chosen), MERGED into the
  `content_plan` block that already carries `vertical`, and guarded by the
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

- 2026-08-07 — Claude: **bulk deepen.** `usePlanBulkDeepen` runs the existing
  research-grounded deepen over every EMPTY-brief page (deepen replaces briefs
  server-side, so non-empty pages are excluded by design): sequential,
  cancellable between pages, per-page failure isolation, live progress in the
  PlanGenerateBar strip ("Deepen briefs (N)" behind a confirm). Closes the
  last approved item in `docs/handoffs/content-plan-ai-steps.md`.
- 2026-08-07 — Claude: **plan⇄CMS visibility (WF-11).** New aidream read
  `GET /content-plan/sites/{id}/cms-pages` (paired site's PageSummary rows,
  read-only, never pairs) consumed by `setup/bridge.ts#bridgeCmsPages` +
  `hooks/useCmsPageMap.ts` (auto-fetch, `planKeys.cmsPages`; unpaired = null,
  never an error; invalidated by the bridge rungs). Tree rows and the table
  (new sortable/filterable "Page" column, prefs version 2) badge each node
  Draft/Published; NodePanel gained a "CMS Page" card (route, publish state,
  Edit in CMS, Open live/Preview). Brand-site Quick work links Content plan +
  the paired CMS site (WF-12).
- 2026-07-30 — Claude (round 6): **every step now has an agent; keyword
  strategy is TOP-DOWN.** Three more platform agents (six total):
  **Keyword Strategist** (`e063ded1-…`) — Arman's ruling that keywords are
  never per-page: it takes the WHOLE plan + keyword library + research report
  and returns per-page role (money / supporting / navigational), a distinct
  primary per money page, the secondary cluster, the money routes each
  supporting page FEEDS, and the internal links (anchored on the TARGET's
  keyword) that pass authority there, plus cannibalization warnings.
  `setup/keyword-strategy.ts` applies it through the CANONICAL
  `ensureKeywordId` upsert + the feature's own `addNodeSecondaryKeyword`
  edge wrapper, with the cross-page relationships on
  `attributes.keyword_strategy`. **Entity Attacher** (`a1a7784c-…`) —
  whole-plan E-E-A-T assignment constrained to the site's existing roster;
  gaps come back as `missing_entities`, never invented
  (`setup/entity-attach.ts`). **Brief Writer** (`711d29b5-…`) — NodePanel
  "Draft brief": neighbour-aware (parent/siblings/children + the keyword
  assignment) so a brief cannot duplicate a sibling; STAGES into the panel
  draft, unlike Deepen which saves. All 11 `ui.ui_surface_agent_role` rows
  are now bound (`brief_writer` included). Merged latest `main` first.

- 2026-07-30 — Claude (round 5): **adversarial-review fixes on the round-4
  work** (21-agent find+refute; 11 confirmed, 7 refuted). Topics are now
  stored authoritatively in `attributes.planned_topics` — `brief` alone was
  unsafe because aidream's Deepen does `update_brief(mode="replace")` on any
  node it runs against; the brief marker block is now a human-visible MIRROR
  that costs nothing to lose. `composeTopicBrief` preserves user lines BELOW
  the block (it used to truncate them). A commit no longer clears the draft
  when a topic write failed — topics have no re-derivation path
  (`namesFromPlan` is pages-only), so the draft was the last copy; a new
  "Record on hub" action retries without a commit (the commit button
  disables once every page exists). Review fixes: agent routes are
  `normalizeRoute`d (the slug CHECK rejects `/services/Hard_Drive_Shredding`
  verbatim, and un-normalized strings broke the already-planned/added
  comparisons); a top-level suggestion is always addable (`parent_id NULL` is
  canonical — 18 such nodes live — so "/" means "no section needed", not
  "blocked"); a missing `planned` status now fails loudly instead of a silent
  no-op; a failed Add renders as a dismissible banner ABOVE the findings
  instead of replacing the whole paid review; and `buildCurrentPlanLines`
  sends each node's REAL status instead of hardcoding "planned" (the auditor
  was told published pages were unbuilt).
- 2026-07-30 — Claude (round 4): **count-only topics + semantic plan review.**
  Count-only families (blog/guides) gained an "AI topics" control (same Family
  Namer agent, article-title guidance); titles persist in the draft
  (`topics_by_archetype`) and land on the family HUB node's brief at commit
  via `applyFamilyTopics` + `composeTopicBrief` — an idempotent
  `Planned topics (from research):` marker block, never new pages behind the
  archetype's back (the expander is a fixture-pinned twin and was NOT
  touched). Fourth platform agent **Content Plan Reviewer**
  (`2a7f0dc8-5525-437a-8f2e-35f12a45cb27`) audits the live plan against the
  research report; `PlanReviewSection` renders findings beside the structural
  lint, and a `gap` finding whose parent route already exists creates the page
  through `createPlanNode` in one click. `REVIEWER_OUTPUT_CONTRACT` is sent as
  binding `guidance` on every review run — without it the agent returns a
  summary naming six missing pages and ONE finding (measured). Roles bound:
  `plan_architect` + `eeat_curator` (manifest + `ui.ui_surface_agent_role`);
  `brief_writer` deliberately left null (Deepen owns that job — reason
  recorded in the manifest). Handoff: `docs/handoffs/content-plan-ai-steps.md`.
- 2026-07-30 — Claude (round 3): **adversarial-review fixes** (20-agent
  find+refute workflow over both repos' diffs; 14 confirmed). Setup now seeds
  from the FRESH site row (`fetchFreshSite`), never the 60s-stale siteOptions
  cache; the debounced autosave FLUSHES on unmount and before commit
  (pendingRef + committingRef — a cancelled debounce was the lost-typing bug
  reborn); `lastSavedRef` marks saved only AFTER the write lands (failed
  saves retry via pending); draft/link writes invalidate
  `marketingKeys.siteOptions()`; SetupView keyed by siteId;
  SetupBridgeSection's `recordCmsLink` reads the fresh row (autosaves bump
  `version` deterministically); the generate popover sends an explicit topic
  only on an in-session pick. NEW canonical read
  `getLatestSuccessfulDocument` (+ hook) in features/research — the
  AI-grounding consumers now match aidream's `_load_research_report`
  semantics (a failed newest re-assembly no longer hides a good older
  report); `useServiceQuery` refactored to derived loading (pre-existing
  setState-in-effect lint errors). aidream: `send_warning` calls wrapped in
  typed `WarningPayload` (plain strings crashed the emitter — pre-existing
  calls fixed on sight), research grounding is fail-degrade (never kills a
  paid run), `_record_site_archetype` re-reads the row before its settings
  write (FE autosaves made the stale-snapshot clobber real), and
  `research_topic_id` is authorized through `iam.has_access_for(user,
  'research_topic', id, 'viewer')` — fail-closed (it was a cross-org report
  exfiltration hole).
- 2026-07-30 — Claude (round 2): **research grounding everywhere + entity
  curation.** ONE site↔research link — `settings.content_plan
  .research_topic_id` (`SITE_RESEARCH_TOPIC_KEY`, FE-written via
  `recordSiteResearchTopic` in `setup/draft.ts`; aidream's generator AND
  deepen read the same key server-side, twin constant in its
  `archetypes.py`). New shared `components/ResearchTopicSelect.tsx` (consumed
  by SetupAiBar + the Generate popover); PlanGenerateBar gained a
  research-grounding picker and `usePlanGenerate` passes
  `research_topic_id` to `/generate`; Setup topic picks record the link;
  NodePanel Deepen is grounded automatically (no FE change). Third platform
  agent "Content Plan Entity Curator"
  (`c43e4497-3093-4b18-a906-b088127d8b9c`, Sonnet 5) wired as
  EntityManager's "Suggest from research" (confirm-before-create; provenance
  in `attributes.research`); `entity_curator` role bound in manifest + DB.
  Boy-scout: ContentPlanWorkbench pre-existing rules-of-hooks violation
  (useCallback after early return).
- 2026-07-30 — Claude: **Setup got real step AI + save-as-you-go.** Two new
  platform agents created via the AI Dream MCP (Claude Sonnet 5, json_schema
  output): "Content Plan Shape Planner" (`b600975c-fc8f-4f1d-ab36-670be436a038`)
  and "Content Plan Family Namer" (`7a16db8c-48eb-4997-a8d0-dc4a8892d7c5`).
  New `SetupAiBar` strip (research-topic picker over `useAllTopics` +
  `useResearchDocument` — the final report grounds every run) with
  "Recommend shape & counts"; per-family "AI names" buttons on the count rows
  (pages families). Runs are headless `launchAgentExecution` + JSON
  extraction (`setup/ai.ts`); results stage through the existing setters.
  NEW draft persistence `setup/draft.ts` → `settings.content_plan.setup_draft`
  (autosave every change, seed on open, clear on full commit; commit's record
  write now re-reads the fresh site row). `site_shaper` role bound to the
  Shape Planner in the manifest + `ui.ui_surface_agent_role` (live). Known
  gap: the shell-header Agents panel lists `agent.card`-backed bindings only,
  so these definition-tier agents don't appear there — the on-page bar is the
  entry point.
- 2026-07-29 — Claude: **plan-vs-reality overlay (Deliverable 4).** Header
  Radar button runs aidream's crawl reconciler
  (`POST /content-plan/sites/{id}/reconcile`); report held in ONE cache entry
  (`hooks/usePlanReality.ts`, `planKeys.reality`) shared by the header
  trigger and the workbench overlay: `PlanRealityBar` strip
  (matched/ghost counts, orphans sheet capped at 300 rows, explicit
  "no crawl data yet" state instead of implying content death) + green
  live-dots on matched tree rows (`liveById` prop). Manual-run only —
  reconcile writes `realizes` edges server-side. Live-verified on
  datadestruction.com (2 live · 2 ghosts · 750 orphans); Sonnet adversarial
  review fixes applied (key convention, view-scoped hint copy, orphan cap,
  no-crawl copy). Table/map badges + the allgreen disposition view remain
  follow-ups in the work order.

- 2026-07-29 — Claude: **per-view surface family + surface writeback v1.**
  Split the one workspace surface into five (list / base / setup / entities /
  node — see Entry points); moved `brief_writer` to the node surface, added
  `site_shaper` (setup) + `entity_curator` (entities). First consumer of the
  new read/WRITE manifest layer: writeTargets declared per surface, handlers
  registered on each view's `SurfaceRuntimeProvider`, all staged (draft/ui)
  except `save_node`. Fixed dead route mapping (marketing resolver swallowed
  `/marketing/content-plan` into `matrx-user/marketing`). DB mirror synced +
  live-verified; all five views browser-verified error-free.
- 2026-07-29 — Claude: **Concept library v2 twin + Setup pickers** (rulings
  2026-07-28; aidream migration `0295` live). Twin learned
  `nameOptions`/`hub`/`hubMember`, `ConceptSelection.name`,
  `ArchetypeFamily.parentKey`, `expandArchetype conceptNames`; committed record
  gained `concept_names`. Setup Concepts rows now carry name chips + Custom…,
  a `hub` badge and "Nests under X". Lineup is FIVE shapes
  (`local-services-md` renamed `local-services-multi`; a NEW true medium took
  the md key — committed site keys migrated live). Fixture 62 cases, guard
  62/62, proven to redden on injected divergence.
- 2026-07-29 — Claude: **"Generate content" rung (Make-it-real rung 4; publish
  became 5).** `setup/bridge.ts bridgeFill{Preview,Start,Status,Cancel}` →
  aidream's durable cms-fill pipeline (frontier in `plan.cms_fill_job/_item`,
  crash-safe per the durable work-queue standard). Mandatory one-page authored
  preview (sandboxed iframe composing the site's real global CSS + header/
  footer + the generated fragment) before the fan-out confirm; progress polled
  from queue counts (restart-agnostic — hydrates any running job on mount);
  failures shown verbatim; Stop = server-side cancel.
- 2026-07-29 — Claude: **"Publish the site" rung (Make-it-real rung 4).**
  `setup/bridge.ts bridgePublish` → aidream `POST
  /content-plan/sites/{id}/cms-publish` (new `publish_many` capability —
  aidream v0.1.684+); `SetupBridgeSection` rung 4 with mandatory dry-run
  preview, destructive confirm on apply, per-page verbatim results and a
  re-run hint when `remaining_candidates > 0`.
- 2026-07-28 — Claude: **plan structure lint** — `setup/lint.ts` (pure,
  jest-covered) + `PlanLintSection` rendered in the Setup work-order column
  above the Make-it-real rungs: home missing/multiple + orphans (blocking),
  bad slugs / missing routes / duplicate sibling labels (review), empty
  briefs / missing keywords (coverage). Whole-tree pre-flight instead of
  one-by-one reconcile surprises; an aidream `content_plan validate` twin can
  adopt the same rules later (pin with a shared fixture if so).

- 2026-07-28 — Claude: **Setup gained the "Make it real" rungs.** New
  `setup/bridge.ts` (aidream `cms-reconcile`/`cms-align`/`cms-starter-kit`
  clients + `recordCmsLink` settings merge-write) and
  `setup/components/SetupBridgeSection.tsx` (create/link CMS site, starter
  kit, realize with mandatory dry-run preview), injected into
  SetupWorkOrderColumn via `bridgeSlot` under the foundation checklist. The
  readiness panel now acts, not just diagnoses (handoff §3 item 2).
- 2026-07-28 — Claude: **canonical routing + list page + AI buttons.**
  `/marketing/content-plan` became the canonical entry LIST (PlanSitesList on
  MatrxDataTable, per-site plan aggregates via `listPlanSiteStats`, row menu,
  prefs `content-plan-sites`); the workspace moved to
  `/marketing/content-plan/[siteId]` (site = routed segment, `?site=`
  redirects; site switch = push, view switch = replace). Headers split
  (ContentPlanListHeader vs ContentPlanHeader + back link; the header's
  auto-select effect died with the list page). Deliverable 3 wired:
  `useContentPlanAi.ts` streams generate/deepen via `callApi` (phase line,
  mid-stream tree refetch, errors via `describeBackendFailure`), surfaced as
  the PlanGenerateBar strip and the NodePanel Deepen button. Fixed a dead
  root-level `/content-plan` link in PlanNodePatchRenderer. Handoff docs for
  this feature merged into
  `common-docs/systems/cms-system/CMS-BUILDOUT-HANDOFF.md`.

- 2026-07-28 — Claude: **the twin learned the SITE CONCEPT LIBRARY — live
  regression fixed.** A concurrent aidream session rewrote
  `template_map.archetypes` into the selection form (`concepts` / `omits` /
  `foundation_overrides`) beside a new `concepts` catalog; the twin still parsed
  only `core`/`families` and — because unknown keys are correctly REJECTED —
  threw on the whole builtin map, so Site Setup showed "No site shapes
  available" and zero routes for every archetype. New `setup/concepts.ts`
  (catalog parse + `resolveSelection`, mirroring `concepts.py` exactly),
  `ArchetypeCorePage.children` with recursive nested-route expansion,
  provenance stamps (`concept`/`variant`), `omits` + resolved-concept reporting
  on `ExpandedArchetype`, the catalog loaded beside archetypes in
  `loadArchetypeLibrary`, and `SetupView` reading families off the expansion
  instead of the raw config. UI surfaces what each shape LEAVES OUT (shape row +
  a Concepts section listing concept → variant). Fixture grew 20 → 45 cases
  (13 selection expansions incl. all three `about` variants and 3-deep nesting,
  12 error cases) — **authored on aidream's canonical copy first**, generated
  from `expand_archetype` itself, then synced here byte-identical; both runners
  now pass a per-case `catalog`. Verified: 45/45 both sides, and all 10 live
  archetypes (4 seeded + 6 synthetic) expand byte-identically in Python and TS
  against the LIVE catalog. Browser-verified on a throwaway site — nested
  `/about/founder|leadership|team` committed at depth 2 with correct
  DB-computed routes and provenance, re-run reported "Nothing new to create"
  (identityKey invariant intact); all throwaway rows removed.
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
