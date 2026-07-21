-- web_seo_metrics.sql
-- Persisted SERP metadata metrics (deterministic pixel-width + SEO-window
-- evaluation of meta title/description).
--
-- Canonical payload shape (contract v1, identical from both writers):
--   {
--     "v": 1,
--     "source": "scraper" | "client",
--     "computed_at": "<iso timestamp>",
--     "title":       { pixel_width, character_count, desktop_ok, mobile_ok,
--                      seo_length_ok, too_short, ok, issues[] },
--     "description": { ...same keys... },
--     "overall_ok": bool
--   }
--
-- Writers:
--   * web.snapshot.seo_metrics       — the scraper computes at crawl/persist
--     time from the OBSERVED title/description (matrx_scraper.meta_metrics).
--   * web.page.seo_metrics_desired   — the frontend computes on every intent
--     save from the DESIRED title/description
--     (features/seo/serp/metrics.ts buildStoredSeoMetrics).
-- Both implementations share one character-width table and identical issue
-- wording, so stored values never depend on who computed them.

alter table web.snapshot
  add column if not exists seo_metrics jsonb;

comment on column web.snapshot.seo_metrics is
  'Deterministic SERP metrics for the OBSERVED meta title/description, computed by the scraper at persist time. Contract v1 (see migrations/web_seo_metrics.sql).';

alter table web.page
  add column if not exists seo_metrics_desired jsonb;

comment on column web.page.seo_metrics_desired is
  'Deterministic SERP metrics for the DESIRED meta title/description, recomputed by the client on every intent save. Contract v1 (see migrations/web_seo_metrics.sql).';
