---
status: active
updated: 2026-08-17
repos: [matrx-frontend, aidream]
vision: [this doc §Vision — Arman's words, 2026-08-14]
---

# CMS Page Hub — everything that makes a page is PART of the page

The work order for turning `/cms/[siteId]/pages/[pageId]` from an HTML editor into the page's
HOME: every resource that went into making the page (plan, keywords, research, pipeline
artifacts) and every resource the live page produces (search-console data, analysis, findings)
is associated, visible, and manageable from here. Sibling of
[website-factory-vision.md](./website-factory-vision.md) (the pipeline spine); this doc owns the
page-editor surface itself.

## Vision — Arman's words (2026-08-14)

> "All resources that can go into making a page are also **part** of the page and are able to be
> managed directly from the CMS… This page should easily have tabs for the plan, and possibly a
> separate SEO plan, and whatever else are ALL of the things that go into making a page. If those
> things existed when we created this page, we properly associate them and create tabs for them
> here so they can be modified from here."

> "There are pages that weren't created via a plan — but that doesn't mean we can't create a plan
> entry for them, and that plan can be used for consistent and continuous improvements."

> "**The flaw right now: the system seems to forget that just because some step happens before we
> get here, it can forget that step once we're here.** That's not the way the best systems in the
> world work. And once you apply that, some of the NEXT steps are also valid here: if a CMS page
> is live, there's no reason not to provide the live search-console data here, or the analysis we
> have about that page. This is where the page lives and where you edit it — everything that could
> contribute to editing it belongs directly available here."

> "Tabs are cheap — free, in fact, if you properly use routes: if a component somewhere does
> nothing but display the search-console data for a page, we just directly use it. What we don't
> want is an unlimited number of tabs — at one point it becomes too much."

> "Before, during, and after are all captured. Just because we're in the *during* period doesn't
> mean we should forget where we came from and where we can go."

**The doctrine this sets (applies beyond the CMS):** every workspace surface asks three
questions — what came BEFORE this artifact (associate + show it; if it doesn't exist, offer to
create it, never pretend the step didn't exist), what happens DURING (the editor itself), what
comes AFTER (measurement, analysis, findings — the feedback loop back into editing). A tab is a
reused canonical component, never a rebuilt poorer one (Inventory Law).

## WHAT'S NEXT — the open front (updated 2026-08-17)

**The SEO-plan unification is DONE on both halves.** Arman's ruling is canon
(`common-docs/systems/content-planning/FEATURE.md` invariant 9): ONE SEO plan per
page, on `web.page` (`meta_*_desired` + `desired_values`), creatable at planning
time; desired (plan) / observed (crawl) / served (CMS columns) stay distinct.

1. ~~**Unify SEO plan storage onto web.page desired_values**~~ — **DONE
   2026-08-17, verified against the live DB.** `web.page.status` gained
   `planned` (migrations `0382`/`0383`); planned rows are created at plan/CMS
   time through the ONE writer (`ensure_planned_page_urls`) and the crawler
   ADOPTS them by URL (`planned → active`) instead of duplicating — proven on
   cosmeticinjectables (8 routes: 4 adopted existing rows, 4 new planned rows,
   0 duplicates). `plan.node`'s SEO fields were copied onto the page records for
   **567 of 567** nodes (`aidream/scripts/migrate_plan_seo_to_page.py`,
   idempotent; `--verify-only` reports 0 unmoved) and **nothing reads them any
   more** — aidream `page_pipeline` / `cms_fill` / `brief_writer` /
   `setup_agents` read `services/content_plan/page_seo_plan.py`, and the client
   reads `features/marketing/content-plan/page-seo-plan.ts`. The strategist's
   internal links are now the existing `outbound_links` plan (one link system).
   **Column drops are deliberately NOT done** — plan.node still holds its
   copies; retiring them is a separate change after production verification.
2. ~~**One SEO plan editor across plan, marketing, and CMS**~~ — DONE
   (`features/marketing/seo/plan/`, commit a21854870). `plan-model.ts` is the
   canonical per-page normalizer; the site-wide index above builds on it and
   must never re-implement it.
3. **Fix ContextMenuV3 mobile wrapper breaking table rows** — still open.
   cloneElement fix for the `display:contents` div that is invalid around
   `<tr>` (hydration errors on /cms/html-pages at mobile widths).

**Next on the one store:** the best-in-class layer (SERP-intent targets,
entity/heading coverage vs plan, tracking against plan); any bulk SEO-plan
generation follows effort tiers + estimate-before-the-button (never a mid-run
kill). **Also open, lower priority:** research CMS-array reverse filter
(`client_pages.research_topic_ids` in the CMS DB), CMS components→page usage
join (lowest value), Research tab (blocked on website-factory p3/p4/p5).

**One real risk, recorded not hidden:** a planned page's URL is derived from
`web.site.root_url` + the plan route, while `web_announce`/`cms_publish`
anchors a published CMS page at its `page_urls().live_url`. For a CMS site
still served at `mymatrx.com/c/{slug}` those are two different URLs and
therefore two `web.page` rows for one page. Every paired site we plan for has
its own domain, where they agree — but attaching a domain later is the case to
watch, and unifying the two derivations is the follow-up.

## Current state — verified against code + browser 2026-08-15

- **PageEditor** (`features/cms/components/PageEditor.tsx`) tabs: **Code (html/css/js inner
  switcher) · preview · plan · seo · measure · settings · versions** — 7 tabs, URL-synced
  (`?tab=` written on every switch at the buffer grain; legacy `?tab=html|css|js` deep links land
  on the right buffer). Toolbar has "Edit with AI".
- **The identity joins already exist** — this is what makes the hub cheap:
  - `client_pages.plan_node_id` → `plan.node` (the plan that realized the page; bridge
    realize/adopt writes it).
  - `client_pages.web_page_id` → `web.page` (the MEASURED page — CMS migration `0037`,
    2026-08-13 — the door to GSC stats, analysis, snapshots, findings).
- **The BEFORE surfaces exist elsewhere:** plan node panel
  (`features/marketing/content-plan/components/NodePanel.tsx`, embeddable via `hosted`),
  pipeline rail (`NodeStepRail` + `lib/pipeline-progress` over `plan.node_step`/`node_artifact`),
  brief/keyword editors, research grounding.
- **The AFTER surfaces exist elsewhere:** `features/marketing/components/pages/PageWorkspace.tsx`
  (`{ pageId }` = web.page id) — Page Analyzer, open findings, snapshots, keyword suggestions,
  SERP/social windows — mounted at `/marketing/brands/[brandId]/sites/[siteId]/pages/[pageId]`;
  GSC per-page data (`web.gsc_page_stat`, `features/marketing/search-console/`).
- **Creating a plan for a plan-less page exists:** `bridgeAlign(webSiteId, {actions:[{action:
  "adopt", page_id}]})` (`features/marketing/content-plan/setup/bridge.ts` → aidream
  `cms_reconciler`), already used by the Setup view.
- **The gap:** none of it is reachable FROM the CMS page editor, and the reverse doors
  (workspace/plan → CMS editor) are partial.

## Work order

1. ~~Plan tab~~ — DONE 2026-08-14, production-verified (PagePlanTab: node context, adopt flow,
   workspace door).
2. ~~Measure tab~~ — DONE 2026-08-14, production-verified (CmsPageMeasure mounts the canonical
   PageWorkspace wholesale; `usePageLocation` + host-agnostic `MarketingSiteContext` made that
   possible).
3. ~~Reverse doors~~ — DONE 2026-08-14 (`cmsPageEditorHref` is the one href builder; workspace
   header, plan tree badge, table Page column).
4. ~~SEO-plan surface~~ — **DONE 2026-08-15** as a section of the Plan tab (built as
   recommended; Arman can still promote it to its own tab). `PagePlanTab`'s `SeoPlanSection`
   renders the applied `attributes.keyword_strategy` via the canonical
   `readNodeKeywordStrategy`: page role, secondary keywords, supported money routes, and the
   planned internal links with anchor text — every route resolved through `usePlanNodes` to a
   plan-node door when the plan knows it, plain text when it doesn't. Honest empty state links
   the plan workspace. Browser-verified with a live strategy record. NOTE (data, not code): no
   live `plan.node` row carries `keyword_strategy` yet (strategist never applied in
   production), and no `client_pages` row carries `web_page_id` yet (the publish+crawl join has
   never landed) — so today every SEO plan section AND every Measure surface shows its empty
   state. The first strategist apply and the first crawled CMS page light them up.
5. ~~Tab governance~~ — **DONE 2026-08-15** (fold built as recommended; Arman can still switch
   to an overflow menu). html/css/js are one **Code** tab with an inner switcher (7-tab strip);
   every tab switch writes `?tab=` via `history.replaceState` at the buffer grain, so tabs are
   deep-linkable both directions and legacy `?tab=html|css|js` links land on the right buffer.
   `CmsPageEditorTab` (agent scope) still speaks the buffer grain — no manifest change.
6. **Before/during/after audit** — the three named gaps are ALL DONE 2026-08-15,
   browser-verified twice (once by the building session, once independently):
   - PageWorkspace's BEFORE: `PagePlanContextCard` resolves the node through the existing
     push-lane join and renders the canonical `PlanContextPanel` — the SAME component the CMS
     Plan tab renders (lifted into `content-plan/components/`), pipeline rail included, three
     honest empty states with doors, emitted to agents as `plan_context`.
   - NodePanel's AFTER: "What the live page is doing" (`NodeMeasureCard` + `useNodeMeasurement`,
     same joins and query keys as the Measure tab / `usePageWorkspace`), full workspace via
     `CmsPageMeasure` in a lazy `WindowPanel`, seven distinct honest absent-join states.
   - NodeStepRail on the Measure side: carried by `PlanContextPanel` inside
     `PagePlanContextCard` (`showPipeline` defaults on) — no separate build needed.
   **The system-wide sweep ran 2026-08-15.** Five small gaps found and CLOSED same day
   (browser-verified): artifact detail's broken "Open HTML Editor" (now the real
   `/cms/html-pages/{externalId}` route; metadata rows are doors), page-list "Open measurement"
   action (off `web_page_id`, via the one menu builder), CMS site hub header Content plan +
   Site measurement doors (gated on `web_site_id`), page editor Plan-tab Origin section
   (quick-publish page / artifact / conversation doors, all three plan states), and the
   html-pages editor's lineage panel (raw uuids replaced with BEFORE doors + a
   `context_metadata.promotions[]` AFTER door per promoted CMS page). Research forward doors
   DONE 2026-08-15: `ResearchUsedBy` (features/research/components/shared/) inverts the same
   associations read and lists a topic/tag's consuming sites, plan pages, and canonical pages
   as doors — mounted on the topic Outputs studio + tag consolidation view, verified against
   live edges; remaining leg is the CMS-array reverse filter (`client_pages.research_topic_ids`
   in the separate CMS DB). **Plan tree/table AFTER: DONE 2026-08-16** — the aidream payload
   already carried `web_page_id` (`CmsPageSummary`, confirmed against the deployed OpenAPI
   schema; no server change needed); the gap was `CmsPageMapEntry` dropping it. Tree badge +
   table Page column now carry `NodeMeasureDoor` (28d clicks → the editor's Measure tab) over a
   single bulk `v_page_list` read (`usePageSearchPerformance` / `usePlanMeasureOverlay`). No
   join = no badge, never a zero, which is every production row today. Independently verified
   2026-08-16: type-check green, tree renders with zero measure doors and zero errors on a
   joinless plan (the honest hidden state). Listed, lowest value: CMS components editor has no
   component→page usage join (that join doesn't exist yet). Chipped 2026-08-16: pre-existing
   mobile hydration errors on /cms/html-pages (ContextMenuV3's mobile `display:contents` div
   wrapper is invalid around `<tr>` rows — needs a cloneElement fix in the primitive).
   Verified as NOT gaps: Search Console page rows, marketing PagesTable (both door into
   PageWorkspace, which now carries BEFORE + CMS door); CMS collections (not page-shaped).
7. **Research tab (later).** When P2 research artifacts flow (`plan.node_artifact
   kind='research'`), the page's research distillation + cited sources join the Plan tab; a
   separate tab only if it grows an editor. Blocked on website-factory p3/p4/p5.

## Arman's rulings — 2026-08-16 (all implemented same day, browser-verified)

1. **Code-tab fold RATIFIED**, with two amendments, both done: Preview is the FIRST tab and the
   landing default for existing pages (new pages land on Code), and the code sub-tabs are a
   segmented pill group, not a second underline row.
2. **The Plan tab is the REAL editor, not a partial view.** "Why not just render the full plan
   page as a tab and allow full control using the same exact UI?" — done: the tab mounts the
   canonical `NodePanel` (hosted) with the workspace's own hook composition; the read-only
   PlanContextPanel branch is gone from the CMS (it remains the measured-page workspace's
   BEFORE card). Shell widened 2xl→4xl (he flagged the narrow width).
3. **Pipeline at the TOP** — moved first in both `NodePanel` and `PlanContextPanel`.
4. **SEO plan: build the REAL thing, now.** No half-version that later becomes real; must work
   for users who never touch the content-plan system (CMS-native planning); connect everything
   we have, inventory exact current SEO capabilities, then design best-in-class. The inventory
   ran 2026-08-16 (headline: the rich per-page plan already exists as `web.page.desired_values`
   + the Plan-lane cards, but it's keyed to a CRAWLED page identity that a CMS page only gets
   after publish+crawl; `keyword_strategy` and the desired-values link plan are two disconnected
   internal-link prescription systems; the CMS SEO tab reuses none of the canonical SERP verdict
   components). Interim: `SeoPlanSection` now renders inside NodePanel's Targeting section, so
   the strategy view reaches both the CMS tab and the workspace.
   **ARCHITECTURE RULED 2026-08-16 (Arman), BUILT 2026-08-17: ONE SEO plan per page, on `web.page` —
   `common-docs/systems/content-planning/FEATURE.md` invariant 9 is the canon.** Desired
   (plan) / observed (crawl) / served (CMS columns) stay distinct; everything else unifies.
   The typed contract is live (`PageKeywordPlan` / `desired_values.keyword_plan`,
   `features/marketing/types.ts`, commit 454fdab2a). Dispatched as two parallel sessions:
   **(A) storage unification** — planned-status `web.page` rows created at plan/CMS-create
   time, plan.node SEO fields migrated into `desired_values` (strategy internal links →
   `outbound_links`, unifying the two link-prescription systems), pipeline + strategist
   rewired, column drop deferred to a verified follow-up; **(B) the ONE editable SEO-plan
   component** mounted in the plan workspace, the marketing page workspace, and the CMS SEO
   tab — no read-only bounce-you-elsewhere views. After both land: the best-in-class layer
   (SERP-intent targets, entity/heading coverage vs plan, tracking against plan) on top of
   the one store; any bulk SEO-plan generation follows the effort-tier + estimate-before-
   the-button doctrine (`content-planning/FEATURE.md` § EFFORT TIERS — never a mid-run kill).

## Resources

- Editor: `features/cms/components/PageEditor.tsx` · route `app/(core)/cms/[siteId]/pages/[pageId]`
- FE CMS contract: `features/cms/FEATURE.md` (§ Agent surfaces carries the AI-everywhere rule)
- Plan side: `features/marketing/content-plan/` (data/service.ts direct reads, setup/bridge.ts,
  NodePanel/NodeStepRail); pipeline records: aidream `services/content_plan/artifacts.py`
- Measured side: `features/marketing/components/pages/PageWorkspace.tsx`, analysis hooks
  `features/marketing/data/analysis-hooks.ts`, GSC `features/marketing/search-console/`
- Worked example page (plan-created, has `plan_node_id`, unpublished):
  `/cms/4d536826-9795-4788-bbfa-3fc77a59767a/pages/7f79c21a-6a77-4bdc-8e9f-a649ce6376b2`
  — PBW Law, owned by arman@armansadeghi.com in the AI Matrx org. **The `admin@admin.com`
  test login is NOT a member of that org and gets refused** (correct behavior, ugly message —
  chipped). Use `dev-website` (`16f6b29b-…`) for test-login walkthroughs.
- Test login `admin@admin.com` / `Password1234#`; never write to `iopbm` / `prp-injection-md`
  (real clients — use dev-website / cosmeticinjectables).
