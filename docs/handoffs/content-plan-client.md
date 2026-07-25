# Handoff — Content Planning client (the `plan` schema UI)

> **System of record:** `common-docs/systems/content-planning/FEATURE.md` — read it FIRST.
> The DB backbone is LIVE (2026-07-24): `plan.node` / `plan.entity` / `plan.profile`,
> RLS'd, PostgREST-exposed (`supabase.schema('plan')`), typed in
> `types/database.types.ts`. Server work is a separate handoff
> (`aidream/docs/handoffs/content-plan-server.md`). This is the client build only —
> ALL reads/writes go DIRECT to Supabase; the server is only invoked for AI work
> (plan generation, brief deepening) via streaming endpoints it will expose.

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

## Status (2026-07-25, Claude)

- **DONE + live-verified against prpinjectionmd.com:** Deliverable 1 (tree
  editor + node panel + entities) and Deliverable 2 (pillar map) shipped as
  `features/content-plan/` + `/content-plan` (see its FEATURE.md). Verified in
  the browser as admin@admin.com: node create (home/pillar/…, DB-computed
  routes visible), one-write cluster reparent with whole-subtree recompute
  (via the panel's Parent select; DB confirmed), primary-keyword pick +
  save, topic tag, entity CRUD + `reviewed_by` attach with validated
  `plan_review` payload (DB confirmed), map render (~70 nodes) with
  click-to-panel, mobile sheet, light/dark.
- **DB fixes shipped in this pass** (applied + ledgered): plan seed
  categories were `internal` under Matrx System → flipped `public` +
  `cat_list` now honors public rows (`plan_seed_categories_public.sql`);
  `seo.topic`/`seo.keyword_topic` lacked authenticated SELECT grants →
  granted (`seo_topic_authenticated_read.sql`).
- **Test-account note:** admin@admin.com was added as a `member` of the
  Titanium org (iam.memberships) so the canonical test login can exercise
  prpinjectionmd — revoke if unwanted.
- **Open:** Deliverable 3 buttons (blocked on the aidream server handoff —
  UI is fully usable standalone; agent writes appear via header Refresh);
  Deliverable 4 (blocked on the reconciler); drag-reparent works via
  dnd-kit but could not be exercised by the synthetic browser harness
  (hidden-pane rAF throttling) — one human drag-check wanted, the
  non-drag Parent-select path is verified; 400+-node map smoothness not yet
  measured on real data (built with `onlyRenderVisibleElements`); no
  site→vertical binding exists in the DB, so the attributes editor uses an
  explicit profile picker (SoR open item).

## Deliverables (in order)

### 1. `features/content-plan/` — tree editor + node panel (the workhorse)
- Site picker (org's `web.site` rows — note: nodes on brandless sites are REJECTED by
  the DB with a clear message; offer the assign-brand flow, don't mask the error).
- Tree view of `plan.node` (`parent_id` hierarchy; `route`, `depth`, `pillar_label`,
  `cluster_label` are DB-computed — **read-only, never write them**; after a move/rename
  refetch the subtree, the cascade recomputed it).
- Drag-to-reparent = `update({parent_id})`. Cycle/same-site/slug violations come back
  as loud DB errors — surface them verbatim, friendly-wrapped.
- Node panel: label/slug/node_type/page_type/status (categories: dimensions
  `plan_page_type`, `plan_status`), priority, technical_depth, needs_reviewer,
  `brief[]` editor, `attributes` (schema-driven from `plan.profile.attribute_schemas`
  for the vertical), primary keyword picker (search `seo.keyword`, show
  `seo.site_keyword_value` workflow_status/content_role/priority for THIS site —
  the plan reads keyword value, never re-decides it).
- Topics (role `topic`), secondary keywords (role `secondary_keyword`), entity
  attachments (`about`/`cites`/`embeds`/`authored_by`/`reviewed_by` + `plan_review`
  payload) — all `platform.associations` writes with org set, via the existing
  association helpers/UI machinery.
- Entity manager: `plan.entity` CRUD per site (person/source/media/org,
  `plan_source_type` category).

### 2. The pillar map — the flagship view
Spatial rendering of the same tree: pillars as hubs, clusters orbiting, articles as
leaves; color = status, size/badge = priority; pan/zoom/filter (by status, pillar,
keyword coverage). Fully interactive: drag between clusters reparents, click opens the
node panel in a drawer, multi-select → bulk status change. Same data, same writes as
the tree — a second projection, not a second system.

### 3. Agent generation surface
"Generate plan" / "Deepen node" buttons invoke the aidream streaming endpoints (when
the server handoff lands) and live-update the tree as nodes appear (Supabase realtime
or refetch-on-event). Human then edits. Until the server ships, the UI must be fully
usable standalone (manual + agent-via-chat writes appear on refetch).

### 4. Plan-vs-reality overlay (after the server reconciler exists)
Badge nodes by `realizes` edge presence (planned+live / ghost / orphan list);
allgreenrecycling.com's 5,000→400 migration map (`migrates_from` edges) gets a
dedicated disposition view: legacy URL → target node → keep/merge/redirect/retire.

## Rules that bind this work
- Direct-to-Supabase for ALL data (`supabase.schema('plan')`); NEVER route plan CRUD
  through aidream (workspace architecture rule).
- Latest stable, strict types (types are already generated — `Database['plan']`),
  no `any`, no swallowed errors; DB trigger errors are the contract — show them.
- `FEATURE.md` beside `features/content-plan/` in the same change; router CLAUDE.md pointer.

## Acceptance
1. Build a 30-node plan for prpinjectionmd.com by hand in <15 minutes: tree + panel +
   keyword/topic/entity attachment all working, route/pillar labels visibly auto-updating.
2. Drag a cluster with 5 children to another pillar: one write, whole subtree's
   routes/labels correct on refetch, no client-side computation.
3. The pillar map renders allgreen-scale (400+ nodes) smoothly and every visible
   element responds to interaction with a real edit.
