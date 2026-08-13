# SEO Change Tracking

## Purpose

This feature is the intervention ledger for a website. It separates four facts that
must never be collapsed:

1. what was intended;
2. why it was expected to work and how that result reaches a business outcome;
3. whether the planned implementation actually appeared on the live website; and
4. whether later evidence supported or refuted the theory.

The site route is
`/marketing/brands/[brandId]/sites/[siteId]/changes`. The generic entity door
`/marketing/changes/[changeId]` resolves an id to that canonical workspace and opens
its row window with `?change=`.

## Data contract

All CRUD reads and writes go from the browser directly to the RLS-protected `seo`
schema. There is no Python database proxy. The canonical records are:

- `seo.change_set`: one intervention, rationale, business outcome, lifecycle, and
  timing;
- `seo.change_theory`: a falsifiable hypothesis, causal mechanism, business link,
  keyword/page scope, confidence, and verdict;
- `seo.change_metric`: the success rule fixed before measurement, including source,
  direction, target, baseline, observation window, and minimum-data gate;
- `seo.change_item`: the expected live implementation and the crawl/manual evidence
  that proves whether it matches;
- `seo.change_assessment`: append-only evaluation snapshots. A new assessment never
  rewrites what the evidence looked like earlier;
- `seo.change_event`: the milestone/event timeline, including automatic crawl
  verification events;
- `seo.v_change_set_summary`: the sortable ledger projection;
- `seo.v_untracked_snapshot_change`: observed snapshot deltas that have no nearby
  documented intervention. Every row carries the `Document` remedy.

## Reused platform capabilities

- `MatrxDataTable` owns local full-text search, every-column filters/sorts,
  pagination, copy/export, row selection, and accessible page doors.
- `DataRowWindow.dynamic` owns the floating, resizable row window. A row click opens
  the complete record; the View side contains Overview, Theories, Implementation,
  Live results, Assessments, and Timeline tabs, while Edit owns lifecycle timing.
- `EntityRef` and `marketingRoutes` provide page/change doors and safe new-tab
  access. Keyword nouns open the canonical Keyword Intelligence window.
- `seo.gsc_perf_summary` is the only Search Console comparison reader. It preserves
  the established GSC accuracy contract and supports page/keyword scope.
- `seo.web_analytics_daily` is the canonical persisted GA4 fact source.

## Invariants

- An intervention is not a useful record without a reason, a business outcome, a
  theory, a causal mechanism, and at least one measurable target.
- Educational traffic is never accepted as an end by itself; `business_link` must
  state the valuable downstream result it is expected to enable.
- Deployment and impact are different states. A crawl match proves implementation,
  not causality.
- A verdict before `minimum_data_days` is `too_early`.
- Automatic evidence is scoped to the change's canonical page and optional exact
  keyword. Missing provider data remains visibly inconclusive; it is never replaced
  with a silent zero.
- Every change, page, keyword, crawl, and evidence snapshot shown by identity has a
  door.
- Untracked crawl changes are not hidden. The surface shows them as an explicit data
  quality queue with a prefilled retrospective-documentation flow.

## Change log

- 2026-08-12 — Added canonical row/view/window/field Copy, JSON, export, and
  Copy-for-AI controls to the untracked-change recovery queue through
  `MatrxDataTable.copy`.
- 2026-08-11 — Added the theory-backed site ledger, structured four-stage composer,
  implementation verification, GSC/GA4 evidence evaluation, immutable assessments,
  event timeline, row-to-WindowPanel detail, canonical entity doors, and untracked
  crawl-change recovery queue.
