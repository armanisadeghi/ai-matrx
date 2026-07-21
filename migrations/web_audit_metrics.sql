-- web_audit_metrics.sql
-- Persisted deterministic page-audit metrics (contract v1): social share
-- card, heading structure, and indexability verdict for one capture.
--
-- Payload shape:
--   {
--     "v": 1, "source": "scraper" | "client", "computed_at": "<iso>",
--     "social":       { ok, title, title_source, title_length, description,
--                       description_source, description_length, image,
--                       image_source, site_name, url, og_type, card_type,
--                       has_image, issues[{severity,message}] },
--     "headings":     { ok, total, h1_count, first_level, skipped_levels,
--                       empty_count, long_count, issues[] },
--     "indexability": { ok, verdict indexable|check|blocked, http_status,
--                       noindex, nofollow, canonical_url, canonical_matches,
--                       redirect_hops, final_url, issues[] },
--     "overall_ok": bool
--   }
--
-- Writers: the scraper stamps it on every capture
-- (matrx_scraper.audit_metrics.build_stored_audit_metrics); the identical
-- TypeScript implementation lives at features/seo/audit/ (parity-tested).

alter table web.snapshot
  add column if not exists audit_metrics jsonb;

comment on column web.snapshot.audit_metrics is
  'Deterministic page-audit metrics (social card / headings / indexability), computed by the scraper at persist time. Contract v1 (see migrations/web_audit_metrics.sql).';
