---
status: active
updated: 2026-08-20
repos: [matrx-frontend, aidream, my-matrx]
scope: feature
feature: CMS
vision:
  - /Users/armanisadeghi/code/common-docs/projects/content-engine/STATE.md
  - /Users/armanisadeghi/code/common-docs/systems/cms-system/FEATURE.md
---

# CMS — the feature's master handoff

**What this is:** the site/page store, the page editor, the agent write layer, publishing, and the
public renderer that turns a planned page into a live URL.
**Scope:** Feature
**Feature:** CMS
**Vision:** [Content Engine STATE §2.7](/Users/armanisadeghi/code/common-docs/projects/content-engine/STATE.md) — Arman's Page Hub doctrine, verbatim.

🚨 **READ THE CLUSTER DOC FIRST:
[`common-docs/projects/content-engine/STATE.md`](/Users/armanisadeghi/code/common-docs/projects/content-engine/STATE.md)** — it holds
Arman's merged vision, the verified state of the whole plan→build→publish→measure pipeline, the
question ledger, and this feature's pending list in context. This file is the CMS slice only.

The code-verified CMS part map is `common-docs/systems/cms-system/FEATURE.md` § THE CMS FEATURE
MAP. Update it in the same change as any CMS work.

## Remaining work

Full detail, with file paths and evidence, in **STATE.md §4.1**. In priority order:

1. **Button-duplication fix pass — WAITS ON ARMAN.** Verdicts sit in the review queue
   (`4fc1c874`). STATE.md ledger Q3.
2. **Best-in-class layer on the one SEO store** — SERP-intent targets, entity/heading coverage vs
   plan, plan-vs-page verdicts. Nothing today joins a plan to a rendered page.
3. **Collections render half — 4 gaps:** filtering (`gte:now`, so past events never drop off);
   `settings.default_order` ignored by the aidream service and the admin API; `MatrxData.render()`;
   the `cms_page` tool description does not teach the binding syntax.
4. **Hardening/parity tail — 10 items, unowned since 2026-07-23.** The auth item (STATE.md ledger
   Q2) is ✅ **DONE 2026-08-19** — `my-matrx/lib/apiAuth.js` gates all six service-role routes at the
   handler and derives `user_id` from the identity. Still open:
   `dry_run` bypassing the policy gate, version-history UI pages-only (cheap — the API already
   supports 6 entity types), and zero tests on `cms_assets`/`cms_verify`.
5. **CMS build-out tail** — bulk item import, field-schema evolution, route tests, retention
   heartbeat, concept-variant selector, theme/brand wiring, component starter library, per-site
   analytics, plan-lint server half, plan-vs-reality map badges.
6. **Lower priority:** `client_pages.research_topic_ids` reverse filter; components→page usage join.
7. 🚨 **`plan.node.primary_keyword_id` — DO NOT DROP.** Called "retired" in older docs;
   **611 of 771 live nodes still carry data in it.**

## Resources

- Editor: `features/cms/components/PageEditor.tsx` · route `app/(core)/cms/[siteId]/pages/[pageId]`
- FE contract: `features/cms/FEATURE.md` · server: `aidream/services/cms/` (+ `CONTRACT.md`)
- SEO plan: `features/marketing/seo/plan/` (`plan-model.ts` is the one normalizer);
  server `aidream/services/content_plan/page_seo_plan.py`
- Renderer: **my-matrx** `lib/render/clientSiteRenderer.js` (attach the repo before touching render claims)
- Admin agent surface: `app/(admin)/administration/knowledge/cms-agents/`
- Sibling: [website-factory-vision.md](./website-factory-vision.md) (the pipeline that fills pages)
- Test site: wf4-step-queue-proof `/marketing/content-plan/17de2e51-eb28-4f5f-8efa-6cc42d44723e`;
  login `admin@admin.com` / `Password1234#`; **NEVER write to `iopbm` / `prp-injection-md`** (real
  clients — use dev-website / cosmeticinjectables)

## Done

- Page Hub, SEO plan one-store, keyword→pipeline integrity, bulk SEO-plan generation,
  publish→measurement join, page-hub UI polish, plan workspace UX — all code-verified.
  One line each with code pointers in **STATE.md §3**; detail in `features/cms/FEATURE.md`.
