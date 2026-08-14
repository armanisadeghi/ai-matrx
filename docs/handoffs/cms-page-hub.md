---
status: active
updated: 2026-08-14
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

## Current state — verified against code 2026-08-14

- **PageEditor** (`features/cms/components/PageEditor.tsx`) tabs: html · css · js · preview ·
  seo · settings · versions. Internal `activeTab` state, not sub-routes. Toolbar has
  "Edit with AI" (2026-08-13 AI-everywhere wave); SEO/publish-review buttons chipped.
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

Chips fired 2026-08-14 for W1–W3 (each carries its full spec — this list is the tracker):

1. ~~**Plan tab** in PageEditor~~ — **DONE 2026-08-14.** `features/cms/components/PagePlanTab.tsx`
   (`React.lazy` in-gate), tab sits between Preview and SEO and is hidden on `/pages/new`.
   Linked: `usePlanNode` (new single-record hook in `content-plan/data/hooks.ts`) + status
   categories + `useKeywordLabels` + canonical `NodeStepRail`, with a new-tab door to
   `/marketing/content-plan/{site_id}?node={id}`; read-only — the NodePanel editors are NOT
   duplicated. Plan-less + paired site: `bridgeAdopt` behind a `ConfirmDialog`, server per-item
   result shown verbatim, page refetched via the new `onRefetchPage` prop. Unpaired site: says so
   and links `/marketing/content-plan`. `type-check` + `check:surface-drift` clean; browser pass
   still owed (the shared dev server died during compile on three attempts).
2. **Measure tab** — `<PageWorkspace pageId={web_page_id}/>` reused wholesale (React.lazy
   in-gate), + "Open page workspace" door; honest empty state when unjoined. *(chip
   task_66847610)*
3. ~~**Reverse doors** — "Edit in CMS" from PageWorkspace and from every plan tree/table CMS
   badge.~~ **DONE 2026-08-14.** `features/cms/utils/cmsRoutes.ts` (`cmsPageEditorHref`) is
   the one href builder; PageWorkspace's header door resolves off the existing push lane
   (`useCmsEditorHref` → `useCmsPushFacts` → `resolvePushTarget`: `web_page_id` id join
   first, route key fallback — same query key, no second fetch); the plan tree badge and the
   table's Page column are now new-tab links with `stopPropagation` (row select/drag intact),
   and NodeRealityCard's existing door was verified and moved onto the same helper. Unpaired
   site = plain text, never a fake door.
4. **SEO-plan surface.** The page's keyword intent lives in two places (node
   `primary_keyword_id` + `attributes.keyword_strategy` — see aidream content_plan FEATURE.md
   invariant 5). Decide whether it earns its own tab or a section of the Plan tab (recommend:
   section of Plan until it has its own editor), and surface the strategist's planned internal
   links / target queries where the writer can act on them.
5. **Tab governance.** Convert PageEditor's internal tabs to URL state (`?tab=` or sub-routes)
   so tabs are deep-linkable and lazily loaded per Arman's "routes are free" point; beyond ~8
   tabs the tail collapses into an overflow menu (compact-nav pattern). Do this BEFORE adding a
   9th tab.
6. **Before/during/after audit across the rest of the system** — apply the doctrine everywhere
   a page-shaped artifact is edited or displayed, e.g.: the plan NodePanel should peek live
   GSC/analysis for a published node (its AFTER); PageWorkspace should show the plan brief it
   is measuring against (its BEFORE); the pipeline rail belongs on the Measure side too. Sweep,
   list the gaps, chip the clear ones.
7. **Research tab (later).** When P2 research artifacts flow (`plan.node_artifact
   kind='research'`), the page's research distillation + cited sources join the Plan tab; a
   separate tab only if it grows an editor.

## Decisions needed (Arman)

1. **Tab ceiling + grouping:** with Plan and Measure landed the editor has ~9 tabs. OK to fold
   html/css/js into one "Code" tab with an inner switcher (recommended), or prefer the overflow
   menu?
2. **SEO plan:** own tab or Plan-tab section? (Recommend section until it has a dedicated
   editor.)

## Resources

- Editor: `features/cms/components/PageEditor.tsx` · route `app/(core)/cms/[siteId]/pages/[pageId]`
- FE CMS contract: `features/cms/FEATURE.md` (§ Agent surfaces carries the AI-everywhere rule)
- Plan side: `features/marketing/content-plan/` (data/service.ts direct reads, setup/bridge.ts,
  NodePanel/NodeStepRail); pipeline records: aidream `services/content_plan/artifacts.py`
- Measured side: `features/marketing/components/pages/PageWorkspace.tsx`, analysis hooks
  `features/marketing/data/analysis-hooks.ts`, GSC `features/marketing/search-console/`
- Worked example page (plan-created, published): 
  `/cms/4d536826-9795-4788-bbfa-3fc77a59767a/pages/7f79c21a-6a77-4bdc-8e9f-a649ce6376b2`
- Test login `admin@admin.com` / `Password1234#`; never write to `iopbm` / `prp-injection-md`
  (real clients — use dev-website / cosmeticinjectables).
