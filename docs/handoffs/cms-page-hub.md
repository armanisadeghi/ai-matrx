---
status: active
updated: 2026-08-17
repos: [matrx-frontend, aidream]
vision: [common-docs/systems/cms-system/FEATURE.md § The Page Hub doctrine — Arman's words, preserved verbatim]
---

# CMS Page Hub — everything that makes a page is PART of the page

The work order for `/cms/[siteId]/pages/[pageId]` as the page's HOME: every resource that went
into making the page (plan, keywords, research, pipeline artifacts) and every resource the live
page produces (search-console data, analysis, findings) is associated, visible, and manageable
from here. Sibling of [website-factory-vision.md](./website-factory-vision.md) (the pipeline
spine); this doc owns the page-editor surface itself.

## Vision — Arman's words (2026-08-14)

**Canonically preserved (verbatim, with the four 2026-08-16 rulings) in
`common-docs/systems/cms-system/FEATURE.md` § The Page Hub doctrine** — read it there. The core:

> "Before, during, and after are all captured. Just because we're in the *during* period doesn't
> mean we should forget where we came from and where we can go."

Every workspace surface asks three questions — what came BEFORE (associate + show it; absent →
offer to create it, never pretend the step didn't exist), what happens DURING (the editor), what
comes AFTER (measurement, analysis, findings feeding back into editing). A tab is a reused
canonical component, never a rebuilt poorer one.

## Current state — verified against code + live DB 2026-08-17

**The hub surface is DONE and production-verified.** 7 URL-synced tabs (Preview ·
Code[html/css/js pill switcher] · Plan · SEO · Measure · Settings · Versions), deep-linkable both
directions. Plan tab mounts the canonical `NodePanel` (hosted) — the REAL editor per Arman's
ruling, pipeline rail on top; adopt flow for plan-less pages (`bridgeAdopt`). Measure tab mounts
`PageWorkspace` wholesale off `client_pages.web_page_id`. Reverse doors everywhere
(`cmsPageEditorHref`); before/during/after sweep ran twice, all named gaps closed and
browser-verified (details: git history of this file).

**The SEO-plan unification is DONE on both halves** (invariant 9,
`common-docs/systems/content-planning/FEATURE.md` is canon): ONE plan per page on
`web.page.meta_*_desired` + `desired_values.keyword_plan` (+ `outbound_links` as the one
link-prescription system); `web.page.status='planned'` rows minted at plan/CMS time through
`ensure_planned_page_urls`, crawler ADOPTS by URL; 567/567 nodes migrated
(`aidream/scripts/migrate_plan_seo_to_page.py`, idempotent); aidream pipeline/strategist/brief
writer read `services/content_plan/page_seo_plan.py`; the ONE editor
`features/marketing/seo/plan/SeoPlanEditor` is live in all three homes (plan workspace NodePanel,
marketing PageWorkspace, CMS SEO tab via `useCmsPageSeoPlan` + one-click plan-record create).
plan.node's copied SEO columns are retained but retired — **column drop deferred until after
production verification.**

**Measured data state (live DB, 2026-08-17)** — the store is unified but the plans are THIN:

- `web.page`: 682 `planned` rows; 570 carry `keyword_plan` — but **569 are primary-keyword-only**
  (0 with secondary keywords, 2 with page_role, 0 with planned `outbound_links`, 5 with desired
  meta). The migration moved what existed; the strategist has never applied at scale in
  production. **The one store is real; the plans inside it are skeletons.**
- CMS DB `client_pages` (121 rows): 77 have `plan_node_id` (BEFORE doors live), **1 has
  `web_page_id`** (Measure tab + SEO tab empty for ~all CMS pages; the join is minted on-demand
  by the SEO tab's create button or publish+crawl adoption — publish does NOT auto-link), 0 have
  `research_topic_ids`.

## WHAT'S NEXT — the open front

**1. Fill the thin plans — effort-tiered bulk SEO-plan generation (the big one).** The
strategist + apply path exists end-to-end (Setup AI step → `applyKeywordStrategy` →
`updatePageDesiredValues`), but plans are 99% primary-keyword-only. Build the site-level "plan
all pages" run per `content-planning/FEATURE.md` § EFFORT TIERS: pre-estimated cost shown
BEFORE the button, cheap tier merges steps, advanced tier money-no-object — never a mid-run
budget kill. Per-page + per-site controls.

**2. Best-in-class layer on the one store.** SERP-intent targets, entity/heading coverage vs
plan, tracking against plan (observed vs desired verdicts, not timestamps). Benchmark: Ahrefs
content briefs / Clearscope / SurferSEO's plan-vs-page scoring — but wired into our own
crawl + GSC data we already have.

~~**3. Fix `useCmsPagePlanContext`.**~~ DONE 2026-08-17 — the hook now reads plan content from
`plan.node` and ALL SEO intent (keyword, role, secondaries, desired meta, planned links) from
the one store via `useSitePlanIndex`/`planForRoute`; raw `attributes` dropped from agent
context in favour of the structured `seo_plan` block; `features/cms/FEATURE.md` updated.

**4. Annihilate `NodeSeoIntentEditor` (chipped).** The legacy fallback editor
(`content-plan/components/NodeSeoIntentEditor.tsx`) still WRITES retired plan.node fields for
nodes with no `web.page` — edits land in a store nothing reads. The migration it was waiting on
has landed: replace the NodePanel fallback branch with one-click planned-row create
(`ensurePlannedPages`, already written) + `SeoPlanEditor`, delete the file + its
`SeoPlanSection`.

**5. Wire the AFTER join at publish.** 1/121 CMS pages carries `web_page_id`. Publish
(`web_announce`/`cms_publish` path) should create-or-adopt the `web.page` row and write the link
— same one-writer (`setWebPageLink` / server twin), reusing `ensure_planned_page_urls` semantics.
**Carries the recorded URL-derivation risk:** a planned page's URL derives from
`web.site.root_url` + plan route; a published CMS page anchors at `page_urls().live_url` — for a
site served at `mymatrx.com/c/{slug}` those are two URLs → two rows for one page. Unify the
derivation as part of this item; every paired site with its own domain agrees today.

**6. Fix ContextMenuV3 mobile wrapper breaking table rows (chipped).** cloneElement fix for the
`display:contents` div that is invalid around `<tr>` (hydration errors on /cms/html-pages at
mobile widths). `features/context-menu-v3/ContextMenuV3.tsx` ~L663.

**Lower priority:** research CMS-array reverse filter (`client_pages.research_topic_ids`, CMS
DB — 0 rows carry data today, wire when research artifacts flow); CMS components→page usage join
(join doesn't exist); Research tab (blocked on website-factory p3/p4/p5 artifact flow).

## Resources

- Editor: `features/cms/components/PageEditor.tsx` · route `app/(core)/cms/[siteId]/pages/[pageId]`
- FE CMS contract: `features/cms/FEATURE.md` (§ Agent surfaces carries the AI-everywhere rule)
- SEO plan: `features/marketing/seo/plan/` (`plan-model.ts` is the canonical normalizer — never
  re-implement it); server read: aidream `services/content_plan/page_seo_plan.py`
- Plan side: `features/marketing/content-plan/` (NodePanel/NodeStepRail, setup/bridge.ts);
  pipeline records: aidream `services/content_plan/artifacts.py`
- Measured side: `features/marketing/components/pages/PageWorkspace.tsx`, GSC
  `features/marketing/search-console/`
- Worked example page (plan-created, has `plan_node_id`, unpublished):
  `/cms/4d536826-9795-4788-bbfa-3fc77a59767a/pages/7f79c21a-6a77-4bdc-8e9f-a649ce6376b2`
  — PBW Law, owned by arman@armansadeghi.com in the AI Matrx org; the `admin@admin.com` test
  login is NOT a member of that org and gets refused. Use `dev-website` (`16f6b29b-…`) for
  test-login walkthroughs.
- Test login `admin@admin.com` / `Password1234#`; never write to `iopbm` / `prp-injection-md`
  (real clients — use dev-website / cosmeticinjectables).
