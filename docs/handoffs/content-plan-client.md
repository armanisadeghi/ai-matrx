# Handoff — Content Planning client (the `plan` schema UI)

> **System of record:** `common-docs/systems/content-planning/FEATURE.md` — read it FIRST.
> The DB backbone is LIVE (2026-07-24): `plan.node` / `plan.entity` / `plan.profile`,
> RLS'd, PostgREST-exposed (`supabase.schema('plan')`), typed in
> `types/database.types.ts`. Server work is a separate handoff
> (`aidream/docs/handoffs/content-plan-server.md`). This is the client build only —
> ALL reads/writes go DIRECT to Supabase; the server is only invoked for AI work
> (plan generation, brief deepening) via its LIVE streaming endpoints
> (`/content-plan/sites/{id}/generate`, `/nodes/{id}/deepen`, `/reconcile`,
> `/dispositions`).

## Vision constraints (Arman, 2026-07-24)

- **The UI is for seeing, deciding, and correcting — agents do the bulk writing.**
  Humans must find it *very* easy to visualize the content, the pillars, the clusters —
  then drag, drop, dive in, and get it done.
- **NOT a pretty-but-useless graph.** Every visual element must be actionable:
  click = open the node, drag = actually reparent (write `parent_id`), status colors =
  real `plan_status` categories. If a view can't be edited from, it doesn't ship.
- **Product for orgs managing brands** — org-scoped like everything else; Titanium /
  AI Matrx are just the first user orgs. No internal-only assumptions.
- First sites (already in DB with brands + vertical profiles): prpinjectionmd.com,
  datadestruction.com, allgreenrecycling.com, aimatrx.com, titaniummarketing.com.

## Current state (2026-07-26, post build-crisis — groomed; earlier per-day status logs collapsed)

**DONE and on main** (all live-verified against prpinjectionmd.com unless noted):

- **Deliverable 1 (tree editor + node panel + entities) and Deliverable 2
  (pillar map)** shipped at `features/marketing/content-plan/` +
  `/marketing/content-plan` (feature was relocated under marketing). Includes
  the 2026-07-26 UI overhaul from Arman's punch list: resizable tree|panel
  split (cookie `panels:content-plan`), NO truncation (two-line rows: full
  label + full mono route), gray-text purge (primary content is
  `text-foreground`), high-contrast selection (primary rail + tint), node
  panel rebuilt on semantic tokens with labeled sections, entities view
  redesigned, tree skeleton. Pillar map rebuilt: three persisted layouts
  (adaptive radial / tidy tree / pillar columns), full dimension encoding
  (color=status, shape=node_type, size=priority, dashed ring=needs_reviewer,
  dot=keyword bound), legend, six filters, double-click collapse to
  super-nodes, semantic zoom, minimap; 14 layout unit tests. The overhaul
  itself has NOT yet had a human/browser look (pane was hidden) — review
  queue row 681d0da9 is pending on it.
- **Agent-write path (the primary authoring path) — E2E-confirmed on
  production aidream**: agent with `matrx_actions {actions:["plan_tree"],
  apply_policy:"auto"}` run via `POST /api/ai/agents/{id}` emitted the
  envelope; dispatcher applied; plan.node rows landed with trigger-computed
  routes (the `/aesthetics` pillar on prpinjectionmd is that test's real
  output). FE receipt renderers (`features/matrx-envelope/directives/planTree/`)
  registered for `plan_tree` + `plan_node_patch`. Directive options are now
  fully server-catalog-derived (the hardcoded FE list was superseded).
  Content-IR was confirmed the WRONG home for auto-apply (render/validation
  registry only) — the envelope is canonical.
- **Surface** `matrx-user/content-plan` (manifest + runtime emitter + DB rows).
- **DB fixes** (applied + ledgered): plan seed categories → `visibility='public'`
  + `cat_list` honors public rows (`plan_seed_categories_public.sql`);
  `seo.topic`/`seo.keyword_topic` authenticated SELECT
  (`seo_topic_authenticated_read.sql`).
- Test artifacts that exist on purpose: E2E agent "Content Plan Writer (E2E
  test)" (agent.definition 0315e53f-…, admin@admin.com);
  admin@admin.com added as `member` of the Titanium org (revoke if unwanted).

- **List-management layer** (tree toolbar + fourth `table` view) — shipped;
  review-queue row 0b49b353 still awaiting Arman's look.
- **Site Setup, the fifth view (`?view=setup`)** — shipped 2026-07-28 from the
  four-way UI bake-off; the four throwaway `create-*` routes are deleted. Pick
  an archetype, tune family counts (or paste the client's real service list),
  see the exact routes diffed against the live plan, commit idempotently.
  Live-verified end to end on datadestruction.com and read-only on
  prpinjectionmd.com. The bake-off's three open questions are settled and
  recorded in `features/marketing/content-plan/FEATURE.md` § Invariants — the
  load-bearing one for future work: **the archetype expander is a twin of
  aidream's canonical `services/content_plan/archetypes.py`, pinned by a shared
  fixture and `pnpm check:archetype-expansion`. Change aidream first, copy the
  fixture, then fix the twin.**

The 2026-07-26 build-crisis restore (plan-tree preview + apply UX, commit
"(3A)") passed Arman's build-risk review and is merged on main.

**Build-memory audit of this feature's code (2026-07-26):** no API routes, no
generateStaticParams, React Flow stays behind `dynamic({ssr:false})`. ONE
structural flag for Arman: `features/matrx-envelope/registry.tsx` statically
imports all directive renderers (createProjectWithTasks + the two plan ones →
they pull the content-plan data service) and the registry rides the markdown
pipeline into many chunks — lazy per-type renderer loading would be a genuine
build-memory win if needed. Not changed; predates this feature.

## Next work (in order)

1. **Wire Deliverable 3 — UNBLOCKED**: "Generate plan" / "Deepen node" buttons
   calling aidream's live streaming endpoints
   `POST /content-plan/sites/{id}/generate` and `/nodes/{id}/deepen`,
   live-updating the tree (refetch on receipt events).
2. **Deliverable 4 — reconciler endpoints are live too**
   (`/sites/{id}/reconcile`, `/sites/{id}/dispositions`): plan-vs-reality
   badges (`realizes` edges) + the allgreen migration disposition view.
3. **Setup view: per-concept variant selector.** The concept library models
   named variants (`about: single | founder-and-team | founder-exec-everyone` —
   see common-docs content-planning FEATURE.md §7) and the Setup view renders
   the menu + `omits`, but variants are not exposed as a first-class choice.
   Surface them per concept (the CMS work order lists this once, pointing here:
   `/Users/armanisadeghi/code/common-docs/systems/cms-system/CMS-BUILDOUT-HANDOFF.md`).
4. Human checks wanted: the UI overhaul walkthrough (review queue), one real
   drag-reparent on tree + map, 400+-node map smoothness on real data, and a
   Setup pass on a site that HAS a linked CMS counterpart (only `dev-website`
   exists in the CMS project today, and it carries no domain — the linked path
   was proven with a temporary `settings.cms.site_id` override, then reverted).
Both halves of the archetype twin contract are live on `origin/main` in their
own repos and pass 20/20: `pnpm check:archetype-expansion` here, and
`aidream/services/content_plan/tests/test_archetype_expansion_fixture.py`
there (aidream `141d4012c`).

## Open items / cross-repo relays

- **RELAY TO AIDREAM (still open):** the injected canonical `plan_tree`
  output schema is RECURSIVE (`PlanNode -> PlanNode` $defs); Anthropic
  structured outputs reject it ("Circular reference detected") so plan-writing
  agents FAIL on every Anthropic model — OpenAI models work. Fix: emit a
  depth-flattened schema (the FE builder pattern before it was superseded, and
  the E2E agent's stored schema, show the 4-level shape). Also FYI:
  `/api/ai/agents/{id}` serves cached definitions — agent-authoring flows need
  `cache_bypass {agent:true}` after direct definition edits.
- No site→vertical binding in the DB (SoR open item) — attributes editor uses
  an explicit profile picker until decided.

## Deliverables (in order)

### 1. Tree editor + node panel + entities — ✅ DONE (see Current state)
### 2. The pillar map — ✅ DONE (see Current state)

### 3. Agent generation surface — UNBLOCKED, next up
"Generate plan" / "Deepen node" buttons invoking the LIVE aidream streaming
endpoints (`POST /content-plan/sites/{id}/generate`, `/nodes/{id}/deepen`),
live-updating the tree as nodes appear (refetch on receipt events / Supabase
realtime). Human then edits. The UI is already fully usable standalone
(manual + agent-via-chat writes appear on refetch).

### 4. Plan-vs-reality overlay — server endpoints live, build after 3
Badge nodes by `realizes` edge presence (planned+live / ghost / orphan list)
using `/sites/{id}/reconcile`; allgreenrecycling.com's 5,000→400 migration map
(`migrates_from` edges) gets a dedicated disposition view via
`/sites/{id}/dispositions`: legacy URL → target node → keep/merge/redirect/retire.

## Rules that bind this work
- Direct-to-Supabase for ALL data (`supabase.schema('plan')`); NEVER route plan CRUD
  through aidream (workspace architecture rule).
- Latest stable, strict types (types are already generated — `Database['plan']`),
  no `any`, no swallowed errors; DB trigger errors are the contract — show them.
- `FEATURE.md` beside `features/marketing/content-plan/` in the same change; router CLAUDE.md pointer.

## Acceptance
1. ✅ VERIFIED 2026-07-25 — 30+-node plan built on prpinjectionmd.com; tree + panel +
   keyword/topic/entity attachment working, route/pillar labels auto-updating from the DB.
2. ✅ VERIFIED 2026-07-25 — one `parent_id` write moved a 5-child cluster; whole subtree
   recomputed by the DB cascade (via the panel's Parent select; a human mouse-drag
   check is still wanted — synthetic input can't drive dnd-kit).
3. ◻ OPEN — map is built for 400+ (collapse, semantic zoom, minimap,
   onlyRenderVisibleElements) but not yet measured on real allgreen-scale data.
