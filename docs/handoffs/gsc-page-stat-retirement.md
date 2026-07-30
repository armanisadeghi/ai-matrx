# Handoff — retire the legacy `web.gsc_page_stat` GSC pipeline

**Status:** open · **Created:** 2026-07-30 · **Owner:** unclaimed
**Context:** the canonical GSC spine is live — aidream ingests all six
dimension profiles into `seo.search_performance_daily` (nightly
`seo_gsc_sync` + `POST /seo/sites/{id}/gsc/search-performance/sync`), and
`/marketing/search-console` reads it through the `seo.gsc_perf_*` RPCs
(accuracy contract in `migrations/seo_gsc_perf_rpcs.sql`). The legacy
scraper pipeline (`matrx-scraper gsc_sync.py` → `web.gsc_page_stat`,
page×date only, 28-day window) still feeds several surfaces and stays live
until they migrate.

## Preconditions (verify before starting)

- [ ] Canonical table has ≥90 days of `page`-profile history for every
      GSC-bound site (nightly backfill has caught up) — compare
      `seo.gsc_perf_freshness` per site against `web.gsc_page_stat` ranges.
- [ ] Numbers reconcile: per site/date, canonical `page`-profile totals vs
      `web.gsc_page_stat` sums (small GSC aggregation variance is expected;
      property profile is truth).

## Tasks

1. Migrate readers onto the canonical table / RPCs:
   - `features/marketing/seo/keyword/data.ts::fetchGscPageStatRows` /
     `getPageSearchTotals` (page cards) → `gsc_perf_summary`/`breakdown`
     with `page_eq`.
   - `web.v_site_kpis` + `web.v_page_list` GSC columns and the
     `web.site_gsc_daily` / `web.site_gsc_top_pages` RPCs (sites portfolio,
     peeks, coverage) → canonical equivalents (add a site-rollup RPC or
     extend `gsc_perf_*`).
   - `PageSearchConsoleCard` range totals + per-query table →
     `gsc_perf_breakdown(dimension='query', page_eq=…)`.
2. Point the Integrations `GscSyncRow` "Sync now" at the canonical route
   (`features/marketing/search-console/sync.ts`) and retire
   `crawler/direct-client.ts::syncGsc` + the scraper route
   `POST /crawler/sites/{id}/gsc/sync` (aidream/matrx-scraper side).
3. Migrate `web.site.gsc_synced_at`/`gsc_sync` freshness consumers onto
   `seo.collection_run` / `gsc_perf_freshness`.
4. Graveyard `web.gsc_page_stat` (db-graveyard-table skill) + drop the
   scraper `gsc_sync.py` write path; update surface manifests
   (`gsc_metrics_28d`, `gsc_queries`, …) and both repos' FEATURE docs.

## Notes

- Do NOT dual-write. One canonical path per operation — each surface cuts
  over in one change.
- `search_appearance` history is deliberately shallow (90 days; 1 API
  request/day) — never block retirement on it.
