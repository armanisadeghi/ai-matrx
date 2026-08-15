---
status: active
updated: 2026-08-15
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
   the plan workspace. Browser-verified with a live strategy record. NOTE: no live `plan.node`
   row carries `keyword_strategy` yet — the strategist has never been applied in production, so
   the empty state is currently what every page shows.
5. ~~Tab governance~~ — **DONE 2026-08-15** (fold built as recommended; Arman can still switch
   to an overflow menu). html/css/js are one **Code** tab with an inner switcher (7-tab strip);
   every tab switch writes `?tab=` via `history.replaceState` at the buffer grain, so tabs are
   deep-linkable both directions and legacy `?tab=html|css|js` links land on the right buffer.
   `CmsPageEditorTab` (agent scope) still speaks the buffer grain — no manifest change.
6. **Before/during/after audit** — the three named gaps are CHIPPED 2026-08-15 (NodePanel
   shows its AFTER for published nodes; PageWorkspace shows its BEFORE brief; NodeStepRail on
   the Measure side). Beyond those, the system-wide sweep of every page-shaped edit/display
   surface remains open.
7. **Research tab (later).** When P2 research artifacts flow (`plan.node_artifact
   kind='research'`), the page's research distillation + cited sources join the Plan tab; a
   separate tab only if it grows an editor. Blocked on website-factory p3/p4/p5.

## Decisions needed (Arman)

Both 2026-08-14 questions were built as recommended (fold to Code tab; SEO plan as a Plan-tab
section) — ratify or reverse:

1. Keep the Code-tab fold, or switch to an overflow menu?
2. Keep SEO plan as a Plan-tab section, or promote to its own tab once it grows an editor?

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
