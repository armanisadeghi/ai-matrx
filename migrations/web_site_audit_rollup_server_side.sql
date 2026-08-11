-- APPLIED to Matrx Main (txzxabzwovsujtloxrus) 2026-08-11. Record, not mechanism.
--
-- Move the site-audit rollup OFF the browser and INTO Postgres.
--
-- WHY: `fetchSiteAuditRows` pulled every `web.page` row for a site plus every
-- latest snapshot's full `seo_metrics` + `audit_metrics` jsonb into the client
-- and grouped them in JS. For allgreenrecycling.com (4,531 live pages as of
-- 2026-08-11) that is megabytes of jsonb over the wire per page view — and the
-- paged fetch carried a hard 5,000-row ceiling that THREW instead of
-- truncating, so the audit page was ~469 crawled rows away from rendering
-- nothing at all. The aggregation is a pure group-by over stored deterministic
-- metrics: exactly Postgres' job.
--
-- Two functions, both SECURITY INVOKER + STABLE, so `web.page` / `web.snapshot`
-- RLS is the ceiling exactly as it is for `web.v_page_list`:
--
--   web.site_audit_rollup(uuid) -> jsonb   one SiteAuditRollup for a site
--   web.site_audit_trend(uuid)  -> jsonb   AuditTrendPoint[] over every snapshot
--
-- CLASSIFICATION: machine resources are excluded with the SHARED rule, not a
-- new one — `(content_type_last IS NOT NULL AND content_type_last <> 'html')
-- OR web.is_machine_resource_url(url)`, i.e. `web.v_page_list.is_resource`.
-- This is the /wp-json bug (717 JSON endpoints ranked as datadestruction.com's
-- worst pages); see web_page_list_url_shape_resource_class.sql. Do not inline a
-- fourth definition — call the function.
--
-- COUNTING SEMANTICS mirror the TypeScript reference implementation in
-- features/marketing/lib/audit-rollup.ts (jest-tested):
--   * URL-quality issues are counted for EVERY page, always.
--   * SERP title/description issues are stored as plain strings and always
--     count as warnings.
--   * social / headings / indexability issues count by their own severity.
--   * passes.url counts every page whose URL quality is clean, audited or not.
-- Change one, change both.
--
-- ONE rule, THREE mirrors for URL quality — change one, change all three:
--   * web.url_quality_metrics                            (here)
--   * matrx-scraper matrx_scraper/audit_metrics.py::evaluate_url_quality
--   * features/marketing/seo/audit/url-quality.ts::evaluateUrlQuality
--
-- NOTE ON search_path: every function below pins `search_path = ''`. pg_catalog
-- is always implicitly searched, so unqualified built-ins still resolve; only
-- `web.*` objects need qualifying.

-- ---------------------------------------------------------------------------
-- URL quality — the one audit section that needs no crawl data, and the only
-- part of the rollup Postgres has to COMPUTE rather than read. 4,877 of 5,391
-- stored audit payloads carry a `url` section; payloads written before
-- 2026-07-21 (and every never-crawled page) do not, so this fallback drives a
-- real share of the numbers users see.
--
-- Returns the StoredUrlQualityMetrics shape verbatim, so the same value can be
-- read from `audit_metrics->'url'` or computed here interchangeably.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION web.url_quality_metrics(page_url text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
WITH trimmed AS (
  SELECT btrim(COALESCE(page_url, '')) AS u
), split AS (
  -- Mirrors `new URL(trimmed)`: with a scheme we split authority/path/query/
  -- fragment; without one the JS constructor throws and the evaluator falls
  -- back to treating the WHOLE string as the path, with no query or fragment.
  SELECT
    length(u) AS char_count,
    CASE WHEN u ~ '^[a-zA-Z][a-zA-Z0-9+.-]*://'
      THEN substring(regexp_replace(u, '^[a-zA-Z][a-zA-Z0-9+.-]*://[^/?#]*', ''), '^[^?#]*')
      ELSE u END AS path,
    CASE WHEN u ~ '^[a-zA-Z][a-zA-Z0-9+.-]*://'
      THEN COALESCE(substring(regexp_replace(u, '^[a-zA-Z][a-zA-Z0-9+.-]*://[^/?#]*', ''), '\?[^#]*'), '')
      ELSE '' END AS query,
    CASE WHEN u ~ '^[a-zA-Z][a-zA-Z0-9+.-]*://'
      THEN COALESCE(substring(u, '#.*'), '')
      ELSE '' END AS fragment
  FROM trimmed
), flags AS (
  SELECT
    char_count,
    cardinality(array_remove(string_to_array(path, '/'), '')) AS depth,
    (path ~ '[A-Z]') AS has_uppercase,
    (strpos(path, '_') > 0) AS has_underscore,
    (length(query) > 1) AS has_query,
    (length(fragment) > 1) AS has_fragment,
    (path ~ '%[0-9A-Fa-f]{2}') AS has_encoded_chars,
    (strpos(path, '//') > 0) AS has_double_slash
  FROM split
), issues AS (
  -- Emission ORDER matches the TypeScript evaluator exactly.
  SELECT COALESCE(jsonb_agg(issue ORDER BY ord), '[]'::jsonb) AS list
  FROM (
    SELECT 1 AS ord, jsonb_build_object(
      'severity', 'warning',
      'message', format('URL is long (%s chars) — keep URLs under 100 characters', char_count)) AS issue
    FROM flags WHERE char_count > 100
    UNION ALL
    SELECT 2, jsonb_build_object(
      'severity', 'warning',
      'message', format('URL is %s levels deep — content buried past 4 levels reads as less important', depth))
    FROM flags WHERE depth > 4
    UNION ALL
    SELECT 3, jsonb_build_object(
      'severity', 'warning',
      'message', 'URL path contains uppercase letters — mixed case creates duplicate-URL risk')
    FROM flags WHERE has_uppercase
    UNION ALL
    SELECT 4, jsonb_build_object(
      'severity', 'warning',
      'message', 'URL path contains underscores — Google treats hyphens as word separators, underscores as joiners')
    FROM flags WHERE has_underscore
    UNION ALL
    SELECT 5, jsonb_build_object(
      'severity', 'warning',
      'message', 'URL carries query parameters — parameterized URLs fragment crawl equity and analytics')
    FROM flags WHERE has_query
    UNION ALL
    SELECT 6, jsonb_build_object(
      'severity', 'warning',
      'message', 'URL carries a #fragment — fragments are ignored by crawlers')
    FROM flags WHERE has_fragment
    UNION ALL
    SELECT 7, jsonb_build_object(
      'severity', 'warning',
      'message', 'URL path contains percent-encoded characters — prefer plain lowercase ASCII slugs')
    FROM flags WHERE has_encoded_chars
    UNION ALL
    SELECT 8, jsonb_build_object(
      'severity', 'warning',
      'message', 'URL path contains a double slash — usually a link-building bug')
    FROM flags WHERE has_double_slash
  ) emitted
)
SELECT jsonb_build_object(
  'ok', jsonb_array_length(issues.list) = 0,
  'length', flags.char_count,
  'depth', flags.depth,
  'has_uppercase', flags.has_uppercase,
  'has_underscore', flags.has_underscore,
  'has_query', flags.has_query,
  'has_fragment', flags.has_fragment,
  'has_encoded_chars', flags.has_encoded_chars,
  'has_double_slash', flags.has_double_slash,
  'issues', issues.list
)
FROM flags, issues;
$$;

COMMENT ON FUNCTION web.url_quality_metrics(text) IS
  'Deterministic URL-quality evaluation returning the StoredUrlQualityMetrics shape (the same object stored at web.snapshot.audit_metrics->''url''). Mirror of features/marketing/seo/audit/url-quality.ts::evaluateUrlQuality and matrx-scraper audit_metrics.py::evaluate_url_quality. Change one, change all three.';

-- ---------------------------------------------------------------------------
-- The rollup. Returns the SiteAuditRollup shape (camelCase — it is consumed
-- straight into the React Query cache with no reshaping).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION web.site_audit_rollup(p_site_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
WITH classified AS (
  SELECT
    p.id,
    p.url,
    COALESCE(NULLIF(p.path, ''), p.url) AS path,
    -- THE SHARED CLASSIFICATION RULE — identical to web.v_page_list.is_resource.
    ((p.content_type_last IS NOT NULL AND p.content_type_last <> 'html')
      OR web.is_machine_resource_url(p.url)) AS is_resource,
    s.seo_metrics,
    s.audit_metrics
  FROM web.page p
  LEFT JOIN web.snapshot s ON s.id = p.latest_snapshot_id
  WHERE p.site_id = p_site_id
    AND p.deleted_at IS NULL
), page_rows AS (
  -- Narrowing mirrors parseStoredSeoMetrics / parseStoredAuditMetrics: a
  -- payload that fails the version + required-section test is treated as
  -- absent, never as an empty pass.
  SELECT
    c.id, c.url, c.path,
    CASE WHEN c.seo_metrics->'v' = '1'::jsonb
           AND jsonb_typeof(c.seo_metrics->'title') = 'object'
           AND jsonb_typeof(c.seo_metrics->'description') = 'object'
           AND jsonb_typeof(c.seo_metrics->'title'->'pixel_width') = 'number'
           AND jsonb_typeof(c.seo_metrics->'description'->'pixel_width') = 'number'
      THEN c.seo_metrics END AS seo,
    CASE WHEN c.audit_metrics->'v' = '1'::jsonb
           AND jsonb_typeof(c.audit_metrics->'social') = 'object'
           AND jsonb_typeof(c.audit_metrics->'headings') = 'object'
           AND jsonb_typeof(c.audit_metrics->'indexability') = 'object'
      THEN c.audit_metrics END AS audit,
    -- Stored URL section when the payload carries one, live evaluation
    -- otherwise (`audit?.url ?? urlQualityToStored(evaluateUrlQuality(url))`).
    COALESCE(
      CASE WHEN c.audit_metrics->'v' = '1'::jsonb
                AND jsonb_typeof(c.audit_metrics->'social') = 'object'
                AND jsonb_typeof(c.audit_metrics->'headings') = 'object'
                AND jsonb_typeof(c.audit_metrics->'indexability') = 'object'
                AND jsonb_typeof(c.audit_metrics->'url') = 'object'
        THEN c.audit_metrics->'url' END,
      web.url_quality_metrics(c.url)
    ) AS urlq
  FROM classified c
  WHERE NOT c.is_resource
), findings AS (
  SELECT r.id, r.path, 'url'::text AS section,
         COALESCE(i->>'severity', 'warning') AS severity,
         i->>'message' AS message
  FROM page_rows r
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.urlq->'issues', '[]'::jsonb)) i
  UNION ALL
  -- SERP issues are plain strings and are always warnings.
  SELECT r.id, r.path, 'serp', 'warning', i #>> '{}'
  FROM page_rows r
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(r.seo->'title'->'issues', '[]'::jsonb)
    || COALESCE(r.seo->'description'->'issues', '[]'::jsonb)) i
  WHERE r.seo IS NOT NULL
  UNION ALL
  SELECT r.id, r.path, v.section,
         COALESCE(i->>'severity', 'warning'),
         i->>'message'
  FROM page_rows r
  CROSS JOIN (VALUES ('social'), ('headings'), ('indexability')) AS v(section)
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(r.audit->v.section->'issues', '[]'::jsonb)) i
  WHERE r.audit IS NOT NULL
), page_counts AS (
  SELECT
    r.id, r.path, r.url,
    r.audit->'indexability'->>'verdict' AS verdict,
    count(f.id) FILTER (WHERE f.severity = 'error') AS error_count,
    count(f.id) FILTER (WHERE f.severity <> 'error') AS warning_count
  FROM page_rows r
  LEFT JOIN findings f ON f.id = r.id
  GROUP BY r.id, r.path, r.url, r.audit->'indexability'->>'verdict'
), totals AS (
  SELECT
    count(*) AS total_pages,
    count(*) FILTER (WHERE seo IS NOT NULL OR audit IS NOT NULL) AS audited_pages,
    count(*) FILTER (WHERE audit->'indexability'->>'verdict' = 'indexable') AS v_indexable,
    count(*) FILTER (WHERE audit->'indexability'->>'verdict' = 'check') AS v_check,
    count(*) FILTER (WHERE audit->'indexability'->>'verdict' = 'blocked') AS v_blocked,
    count(*) FILTER (WHERE (seo->'overall_ok')::boolean) AS pass_serp,
    count(*) FILTER (WHERE (audit->'social'->'ok')::boolean) AS pass_social,
    count(*) FILTER (WHERE (audit->'headings'->'ok')::boolean) AS pass_headings,
    count(*) FILTER (WHERE (urlq->'ok')::boolean) AS pass_url
  FROM page_rows
), resource_count AS (
  SELECT count(*) AS n FROM classified WHERE is_resource
), grouped AS (
  SELECT
    f.section,
    f.message,
    (array_agg(f.severity ORDER BY f.id))[1] AS severity,
    count(*) AS n,
    (array_agg(jsonb_build_object('pageId', f.id, 'path', f.path) ORDER BY f.id))[1:3] AS samples
  FROM findings f
  GROUP BY f.section, f.message
)
SELECT jsonb_build_object(
  'totalPages', totals.total_pages,
  'nonHtmlResources', resource_count.n,
  'auditedPages', totals.audited_pages,
  'uncomputedPages', totals.total_pages - totals.audited_pages,
  'verdicts', jsonb_build_object(
    'indexable', totals.v_indexable,
    'check', totals.v_check,
    'blocked', totals.v_blocked),
  'passes', jsonb_build_object(
    'serp', totals.pass_serp,
    'social', totals.pass_social,
    'headings', totals.pass_headings,
    'url', totals.pass_url),
  'topIssues', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'section', g.section,
             'severity', g.severity,
             'message', g.message,
             'count', g.n,
             'samples', to_jsonb(g.samples))
           ORDER BY (g.severity = 'error') DESC, g.n DESC, g.message)
    FROM grouped g), '[]'::jsonb),
  'worstPages', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'pageId', pc.id,
             'path', pc.path,
             'url', pc.url,
             'errorCount', pc.error_count,
             'warningCount', pc.warning_count,
             'indexabilityVerdict', pc.verdict)
           ORDER BY pc.error_count DESC, pc.warning_count DESC, pc.path)
    FROM page_counts pc
    WHERE pc.error_count + pc.warning_count > 0), '[]'::jsonb)
)
FROM totals, resource_count;
$$;

COMMENT ON FUNCTION web.site_audit_rollup(uuid) IS
  'Server-side site-audit rollup (SiteAuditRollup shape) over web.page + each page''s latest web.snapshot metrics. SECURITY INVOKER — RLS is the ceiling. Excludes machine resources via the shared web.is_machine_resource_url rule. Counting semantics mirror features/marketing/lib/audit-rollup.ts::buildSiteAuditRollup; change one, change both.';

-- ---------------------------------------------------------------------------
-- Score trend — the same pass counting, one bucket per UTC capture day, over
-- EVERY historical snapshot rather than each page's latest. Only the four
-- section pass counts and the page/audited counts are needed per day, so this
-- never materializes issues or per-page rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION web.site_audit_trend(p_site_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
WITH snapshot_rows AS (
  SELECT
    (s.captured_at AT TIME ZONE 'UTC')::date AS day,
    CASE WHEN s.seo_metrics->'v' = '1'::jsonb
           AND jsonb_typeof(s.seo_metrics->'title') = 'object'
           AND jsonb_typeof(s.seo_metrics->'description') = 'object'
           AND jsonb_typeof(s.seo_metrics->'title'->'pixel_width') = 'number'
           AND jsonb_typeof(s.seo_metrics->'description'->'pixel_width') = 'number'
      THEN s.seo_metrics END AS seo,
    CASE WHEN s.audit_metrics->'v' = '1'::jsonb
           AND jsonb_typeof(s.audit_metrics->'social') = 'object'
           AND jsonb_typeof(s.audit_metrics->'headings') = 'object'
           AND jsonb_typeof(s.audit_metrics->'indexability') = 'object'
      THEN s.audit_metrics END AS audit,
    COALESCE(
      CASE WHEN s.audit_metrics->'v' = '1'::jsonb
                AND jsonb_typeof(s.audit_metrics->'social') = 'object'
                AND jsonb_typeof(s.audit_metrics->'headings') = 'object'
                AND jsonb_typeof(s.audit_metrics->'indexability') = 'object'
                AND jsonb_typeof(s.audit_metrics->'url') = 'object'
        THEN s.audit_metrics->'url' END,
      web.url_quality_metrics(p.url)
    ) AS urlq
  FROM web.snapshot s
  JOIN web.page p ON p.id = s.page_id AND p.deleted_at IS NULL
  WHERE s.site_id = p_site_id
    AND s.deleted_at IS NULL
    AND NOT ((p.content_type_last IS NOT NULL AND p.content_type_last <> 'html')
             OR web.is_machine_resource_url(p.url))
), per_day AS (
  SELECT
    day,
    count(*) AS total_pages,
    count(*) FILTER (WHERE seo IS NOT NULL OR audit IS NOT NULL) AS audited_pages,
    count(*) FILTER (WHERE (seo->'overall_ok')::boolean)
      + count(*) FILTER (WHERE (audit->'social'->'ok')::boolean)
      + count(*) FILTER (WHERE (audit->'headings'->'ok')::boolean)
      + count(*) FILTER (WHERE (urlq->'ok')::boolean) AS sections_passed
  FROM snapshot_rows
  GROUP BY day
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'day', to_char(day, 'YYYY-MM-DD'),
    'overallScore', CASE WHEN audited_pages > 0
      THEN round((sections_passed::numeric / (4 * audited_pages)) * 100)::int END,
    'totalPages', total_pages,
    'auditedPages', audited_pages
  ) ORDER BY day), '[]'::jsonb)
FROM per_day;
$$;

COMMENT ON FUNCTION web.site_audit_trend(uuid) IS
  'Per-UTC-day site audit score trend (AuditTrendPoint[] shape) over every historical web.snapshot. SECURITY INVOKER — RLS is the ceiling. Mirrors features/marketing/lib/audit-rollup.ts::buildSiteAuditTrend.';

GRANT EXECUTE ON FUNCTION web.url_quality_metrics(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION web.site_audit_rollup(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION web.site_audit_trend(uuid) TO authenticated, service_role;
