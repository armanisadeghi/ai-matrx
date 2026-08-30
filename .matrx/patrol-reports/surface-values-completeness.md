# P12 · Surface Values completeness

Run: `2026-08-30T141811Z`

Base: `b029fd439333075600bd9ae7522f3907e3dd3395`

State: **INFRASTRUCTURE BLOCKED** — the three-Surface source candidate and database mirror are complete and independently static-clean, but this task did not expose the required isolated in-app Browser controller. The manifests therefore remain honestly `partial`; no product candidate is certified or released.

Candidate: `ded49823bc44dee83d4d1012f235ac92fee92ab9`, preserved at `refs/heads/patrol-runs/P12/2026-08-30T141811Z-candidate`.

## Outcome

- Ranked Surface findings taken: **3**.
- Source/mirror implementations completed: **3**.
- Independently certified: **0**.
- Verdict: **INFRASTRUCTURE BLOCKED**, not rejected. No candidate-caused source defect remains.
- Human approvals required: **0**.
- Release: **none**. The candidate has no containing release tag, so the production URLs below are target test addresses, not a claim that the update is deployed.
- Integration defects caught and repaired before the final candidate: **2** — the Page Research canonical label mismatch, and a shared-checkout merge that stripped 1,084 lines of runtime wiring. The preserved first candidate supplied the exact recovery source.

## Three completed source contracts

| Surface | Canonical identity | Declared contract | Safe writes |
| --- | --- | --- | --- |
| Quick Answers | `matrx-user/keyword-quick-answers` / `keywordQuickAnswersWindow` | 28 values, 5 resolved groups, nested provider, live question/batch/session scope, read/edit v3 menus, Locate anchors | `reason_draft` (reversible draft), `active_dimension_slug` (ask-gated UI); answer persistence stays on the existing user buttons |
| Keyword Research window | `matrx-user/keyword-research-window` / `keywordResearchWindow` | 35 values, 5 resolved groups, selected-site/library/durable-run scope, v3 menu, Locate anchors, honest load/retry state | `selected_site_id`, `library_search`, `explorer_open`, `research_input_keyword`; the paid Research action remains human-only |
| Page Research | `matrx-user/page-research` / `pageResearchWindow` | 29 values, 4 resolved groups, page/draft/run composites, editable and read-only menus, Pro inputs, Locate anchors, recoverable attachment/run errors | `topic_name`, `keywords`, both ask-gated drafts; Start Research and attachment remain human-only |

The existing routed `matrx-user/keyword-research` workbench keeps its identity. The floating window has the distinct `matrx-user/keyword-research-window` identity so route and overlay ownership do not collide.

The canonical mirror sync completed with **92 values, 4 agent roles, and 8 write targets** across the three declarations. Count-only re-reads confirmed all three `ui.ui_surface` rows and their exact focused mirror totals.

## Exact interaction paths for Browser retry

These are the exact live-production-shaped URLs for the selected safe test fixture. They are **not yet deployed URLs** because certification and release are still blocked.

1. Quick Answers target: `https://aimatrx.com/marketing/370f9281-2c10-41bf-af9e-5784aaee5838/seo/98853cae-68f4-4c81-b1c0-7ef09340a4f5/keywords/value`
   - Interaction: open the page, then choose **Quick Answers** in the KPI band.
2. Keyword Research target: `https://aimatrx.com/marketing/keyword-research?panels=keyword_research`
   - Interaction: the route-owned URL hydrator opens **Keyword Research**; alternatively use **Tools → Keyword Research**.
3. Page Research target: `https://aimatrx.com/marketing/370f9281-2c10-41bf-af9e-5784aaee5838/content/plan/98853cae-68f4-4c81-b1c0-7ef09340a4f5?node=f155cc1a-8a3f-43a1-9365-a9ef7f8eccaf`
   - Interaction: open the selected **Contact** node, find its Research section, then choose **Run research for this page**. Do not press the paid Start action during declaration proof.

The Browser retry must confirm the exact window identity, Surface Context values and groups, no missing Always values, no undeclared runtime-only keys, Locate behavior, context-menu posture, safe draft/UI writes, and clean console/error-inspector state. Only then may readiness become `verified`, independent certification be recorded, and the candidate enter the release lane.

## Evidence

- `pnpm type-check`: PASS on the corrected candidate.
- Focused ESLint: PASS; seven metadata barrel warnings are unchanged baseline debt.
- `pnpm check:surface-drift`: PASS — 197 surfaces, 4,849 values, 435 write targets, 6 client tools.
- `pnpm check:surface-routes`: PASS — 783 core routes, 631 resolved, 27 deliberately unmapped, 125 audit backlog.
- `pnpm check:surface-overlays`: PASS — 190 unique overlays, 31 declared, 159 undeclared.
- Strict impact checks: PASS for all three focused Surface IDs against the live database mirror.
- Responsive keyword-research Jest contract: 2/2 PASS.
- Scoped `git diff --check`: PASS.
- Independent certifier: `/root/p12_certifier`; exact SHA `ded49823bc44dee83d4d1012f235ac92fee92ab9`; no static/source regression.
- Preview lease: canonical checkout preview remained on port 3001. It was not reused through an alternate browser.

## Queue and backlog

These three rows remain the first P12 queue entries with status `browser-proof-blocked`. The next P12 wake must resume this exact run and candidate before scanning or taking another Surface family.

Current measured inventory is 159 undeclared overlays + 125 unresolved routes + 121 declared surfaces below verified readiness. These evidence sets can overlap; they are prioritization inputs, not a claim of 405 unique product screens.

## Recursive learning

The permanent candidate ref prevented a shared-checkout merge from silently converting complete runtime surfaces back into declaration-only manifests. The smallest next machinery improvement is a P12 integration guard that fails when a newly declared overlay loses its expected host-side `SurfaceRuntimeProvider`, canonical menu, scope builder, or Locate anchors. That guard complements Browser proof; it does not replace it.
