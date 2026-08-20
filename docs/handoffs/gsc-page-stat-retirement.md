---
status: active
updated: 2026-08-11
repos: [matrx-frontend, aidream, matrx-scraper]
---

# Retire the legacy `web.gsc_page_stat` GSC pipeline

The replacement spine is live: aidream ingests all six dimension profiles
into `seo.search_performance_daily` (**14,194,333 rows, 7 sites, 2025-04-06 →
2026-08-16**), and `/marketing/search-console` reads it through 21
`seo.gsc_perf_*` RPCs.

> 🔴 **URGENCY RAISED 2026-08-19.** This is no longer "legacy remains until the readers migrate."
> **`web.gsc_page_stat` is DEAD DATA**: its newest `date` is **2026-07-26** and its last write was
> **2026-08-04**; the last successful `gsc_sync` was 2026-07-28 and the only attempt since
> (2026-08-12) failed. The four readers below are therefore **serving ~25-day-old numbers in
> production today**, while the replacement carries ~14 months more history on every site.
> **The ≥90-day precondition is MET** (495–498 distinct `page`-profile dates per site vs five weeks
> in the legacy table) — the first checkbox below is satisfied and retirement is unblocked on the
> data axis.
>
> Related and unresolved: the credential-resolution failure that killed the sync. The documented
> "409" is stale — the current symptoms are **403** ("the Google connection belongs to neither the
> requesting user nor the given organization") and **404** ("Google connection not found").
>
> Cluster state: [`common-docs/projects/seo-engine/STATE.md`](/Users/armanisadeghi/code/common-docs/projects/seo-engine/STATE.md).

## Resources

- Feature contract: `features/marketing/search-console/FEATURE.md`
- Accuracy contract: `migrations/seo_gsc_perf_rpcs.sql`
- Canonical site portfolio adapter:
  `migrations/seo_gsc_site_portfolio_canonical_source.sql`
- Sync entry point: `features/marketing/search-console/sync.ts`

## Remaining work

Before retiring the table, verify:

- [x] **MET (verified 2026-08-19).** Replacement holds 495–498 distinct
      `page`-profile dates per GSC-bound site (2025-04-06 → 2026-08-16); the
      legacy table covers five weeks and stops at 2026-07-26.
- [ ] Numbers reconcile: per site/date, replacement `page`-profile totals vs
      `web.gsc_page_stat` sums (small GSC aggregation variance is expected;
      property profile is truth).

Then:

1. Migrate the remaining readers onto the replacement table / RPCs:
   - `features/marketing/seo/keyword/data.ts::fetchGscPageStatRows` /
     `getPageSearchTotals` (page cards) → `gsc_perf_summary`/`breakdown`
     with `page_eq`.
   - `web.v_page_list` GSC columns and the `web.site_gsc_daily` /
     `web.site_gsc_top_pages` RPCs (peeks, coverage) → replacement
     equivalents.
   - `PageSearchConsoleCard` range totals + per-query table →
     `gsc_perf_breakdown(dimension='query', page_eq=…)`.
2. Point the Integrations `GscSyncRow` "Sync now" at the replacement route
   — note `syncGscSearchPerformance` is **already imported in the same file**
   (`SiteIntegrationsWorkspace.tsx:70`, used at `:415`/`:418`) but `GscSyncRow`
   at `:1259` still calls `syncGsc`
   (`features/marketing/search-console/sync.ts`) and retire
   `crawler/direct-client.ts::syncGsc` + the scraper route
   `POST /crawler/sites/{id}/gsc/sync` (aidream/matrx-scraper side).
3. Migrate `web.site.gsc_synced_at`/`gsc_sync` freshness consumers onto
   `seo.collection_run` / `gsc_perf_freshness`.
4. Graveyard `web.gsc_page_stat` (db-graveyard-table skill) + drop the
   scraper `gsc_sync.py` write path; update surface manifests
   (`gsc_metrics_28d`, `gsc_queries`, …) and both repos' FEATURE docs.

## Done

- Sites portfolio migrated without changing its caller contract — see
  `migrations/seo_gsc_site_portfolio_canonical_source.sql`.

## Notes

- Do NOT dual-write. Keep one path per operation — each surface cuts
  over in one change.
- `search_appearance` history is deliberately shallow (90 days; 1 API
  request/day) — never block retirement on it.
