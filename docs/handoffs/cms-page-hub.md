---
status: active
updated: 2026-08-18
repos: [matrx-frontend, aidream, my-matrx]
vision: [common-docs/systems/cms-system/FEATURE.md § The Page Hub doctrine — Arman's words, verbatim]
---

# CMS — the feature's master handoff (Page Hub + closeout map)

**THE GLOBAL VIEW LIVES IN ONE PLACE:
`common-docs/systems/cms-system/FEATURE.md` § THE CMS FEATURE MAP** — every CMS part, its
code-verified status, and whether the parts talk. Read it FIRST; update it in the same change as
any CMS work. This doc is the work order for what remains.

## What is DONE (code-verified on origin/main + live DB, 2026-08-18 — one line each)

- **Page Hub**: 7 URL-synced editor tabs; Plan tab mounts the full canonical NodePanel; Measure
  mounts PageWorkspace wholesale; doors both directions. Production-verified.
- **SEO plan, one store** (invariant 9): `web.page.desired_values.keyword_plan` + `meta_*_desired`;
  ONE `SeoPlanEditor` in all three homes; legacy plan-node writer annihilated; typed-keyword
  commit-on-blur fix (the dead-Save trap) proven end-to-end into the live row.
- **Keyword→pipeline integrity** (aidream): `assign_primary_keyword` is the one writer (heals on
  re-apply, lights the `p1_keywords` step); bulk brief paths soft-gate loudly; briefs are
  post-checked for keyword coverage. Tested.
- **Bulk SEO-plan generation**: cheap/thorough/advanced tiers, exact cost before the button,
  crash-safe batches; live-proven on wf4-step-queue-proof (6/6 pages gained roles, secondaries,
  links, meta).
- **Publish → measurement join** (aidream): publish adopts the planned `web.page` row (never a
  duplicate across URL derivations) and writes `client_pages.web_page_id`. Regression-tested.
- **Plan workspace UX**: four chrome rows → ONE toolbar (status-truthful Edit/Live); the pipeline
  rail IS the NodePanel's tab strip (Page | SEO plan | Research | Family | Write | Review |
  Build | Publish), smart default tab, "Write with AI" beside the manual editor; durable
  `web_site_id` CMS-link authority; ContextMenuV3 mobile `<tr>` fix; sparkle-icon ban recorded.

## REMAINING (the work order)

1. **Page-hub UI polish tail (chipped 2026-08-18).** Cut every paragraph empty-state in
   NodeRealityCard / NodeMeasureCard / PageDraftEditor to one short line; Review + Build empty
   states become real components ("Add page content to see a review here"), not gray text;
   Build/Publish stop repeating the same reality card sentences; step-chip visual consistency
   (uniform sizes, dark-friendly status dot, REAL tooltips on every chip and run arrow).
2. **Button-duplication fix pass — WAITS ON ARMAN.** The audit report is in the review queue
   ("Content-plan button duplication audit"): per-control keep/merge/delete verdicts + the
   copy-cluster collapse (plain copy icon + ONE copy-for-AI dropdown) + the misleading skill
   lines to amend. Arman rules, then a session executes.
3. **Best-in-class layer on the one store.** SERP-intent targets, entity/heading coverage vs
   plan, tracking against plan (verdicts, not timestamps). Benchmark: Ahrefs briefs /
   Clearscope / SurferSEO plan-vs-page scoring, wired to our own crawl + GSC data.
4. **Collections render-half re-audit (chipped 2026-08-18).** my-matrx gained
   `lib/render/collectionBindings.js` ("collection SSR and site discovery") AFTER the buildout
   handoff last updated — re-audit `common-docs/systems/cms-system/CMS-BUILDOUT-HANDOFF.md`
   against the code, groom it, and surface its six Arman decisions that still stand.
5. **Hardening/parity tail — unowned since 07-23** (`aidream/docs/handoffs/cms-hardening-and-parity.md`).
   Re-verified 2026-08-18: my-matrx `pages/api/create-page.js` still has ZERO handler-level auth
   (proxy matcher is the only lock). Pre-launch security triage is Arman's call; the feature-gap
   items there (version-history UI pages-only, zero tests on cms_assets/cms_verify) are ordinary
   work.
6. **Lower priority:** research CMS-array reverse filter (`client_pages.research_topic_ids` — 0
   rows carry data yet); components→page usage join (doesn't exist); Research tab (blocked on
   website-factory p2 artifacts); plan.node retired-column drop (after production verification).

## Resources

- Editor: `features/cms/components/PageEditor.tsx` · route `app/(core)/cms/[siteId]/pages/[pageId]`
- FE CMS contract: `features/cms/FEATURE.md` · plan workspace: `features/marketing/content-plan/`
  (NodePanel/NodeStepRail); SEO plan: `features/marketing/seo/plan/` (`plan-model.ts` is the one
  normalizer); server: aidream `services/content_plan/` (`page_seo_plan.py`, `artifacts.py`)
- Pipeline spine (sibling feature): `docs/handoffs/website-factory-vision.md`
- Test site: wf4-step-queue-proof `/marketing/content-plan/17de2e51-eb28-4f5f-8efa-6cc42d44723e`;
  login `admin@admin.com` / `Password1234#`; NEVER write to `iopbm` / `prp-injection-md` (real
  clients — use dev-website / cosmeticinjectables)
