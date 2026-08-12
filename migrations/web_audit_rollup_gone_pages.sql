-- APPLIED to Matrx Main (txzxabzwovsujtloxrus) 2026-08-11. Record, not mechanism.
--
-- GONE PAGES ARE THEIR OWN FINDING — they are not live pages with bad HTML.
--
-- THE BUG. `web.page.status = 'missing'` means the crawler no longer finds the
-- URL. The rollup did not look at `status` at all, so every gone page's
-- LAST-KNOWN snapshot metrics kept flowing into the site audit exactly like a
-- live page's. Gone pages the rollup was scoring, measured the moment before
-- this applied: 212 on titaniumsuccess.com, 167 on iopbm.com, 121 on
-- allgreenrecycling.com, 107 on aimatrx.com — sitting in "pages needing
-- attention" faulted for a missing og:title or a short H1. A user who acts on
-- that edits a page that no longer exists: wasted work, crowding out findings
-- on pages that are real. iopbm.com's entire audit was dead pages — 167 gone
-- against 33 live.
--
-- THE DECISION (product, deliberate). Three moves, and the first one alone
-- would have been a defect:
--
--   1. Gone pages contribute NO HTML-quality finding — no issue, no pass, no
--      indexability verdict, and they leave `totalPages`. Every one of those
--      checks scores a document; on a URL that does not resolve the verdict is
--      about a corpse.
--
--   2. They become their OWN first-class finding with its own count
--      (`gonePages`) and its own complete list (`gonePageDetails`), surfaced on
--      screen with every row reachable. Silently dropping them is forbidden by
--      common-docs/policies/no-dead-ends.md, and it would also throw away one
--      of the most valuable findings in SEO: a page that used to rank and now
--      404s is lost traffic the user needs to see.
--
--   3. The list is ranked by what the page was EARNING — GSC clicks, then
--      impressions, then how recently it was last seen. A gone page with 41
--      clicks last month is urgent; one Google never showed is housekeeping.
--      The traffic numbers come from `web.v_page_list` (gsc_clicks_28d /
--      gsc_impressions_28d), the canonical page projection — not a second
--      hand-rolled aggregate over web.gsc_page_stat. Measured cost of that
--      join on the largest site (allgreenrecycling.com, 4.4k pages): +71ms on
--      a 790ms rollup.
--
-- ORDER OF CLASSIFICATION: alias -> resource -> gone. A /wp-json endpoint that
-- disappears is a crawler detail, not lost traffic, so machine resources are
-- classified out BEFORE the gone check and never appear in the gone list.
--
-- NULL-SAFETY: `is_gone` uses IS NOT DISTINCT FROM. With a bare `=`, a NULL
-- status yields NULL, and `WHERE NOT is_gone` would then silently drop that
-- page from the audit entirely.
--
-- The counting semantics mirror the jest-tested specification in
-- features/marketing/lib/audit-rollup.ts::buildSiteAuditRollup. CHANGE ONE,
-- CHANGE BOTH — parity was re-proven against the live sites after applying
-- (titaniumsuccess.com, allgreenrecycling.com, iopbm.com, vasaro.com,
-- datadestruction.com): identical rollups on every field over 8,693 registry
-- rows, and identical trend points over 4,717 snapshots.
--
-- THE SHARED PAGE-CLASS RULE IS UNTOUCHED. Both halves stay function CALLS
-- (web.is_resource_content_type / web.is_machine_resource_url) and the alias
-- skip stays exactly as web_audit_rollup_shared_rule_and_alias_skip.sql left
-- it. aidream scripts/check_page_class_mirrors.py screams if either is ever
-- inlined again.
--
-- FOUND WHILE RE-PROVING PARITY, AND FIXED (two ordering bugs, both older than
-- this change, both of which made an exact diff impossible):
--
--   * worstPages had no unique final sort key. Two pages can share a path (same
--     path, different query string), so rows tied on errors+warnings+path came
--     back in arbitrary order — differently on each side, and not necessarily
--     stably on either. `pc.id` is now the last key here and `pageId` in the TS
--     reference. Same for gonePageDetails.
--   * The TS reference sorted text with localeCompare; this database collates
--     C.UTF-8, i.e. plain byte order, so `/Hard-Drive-Shredding-San-Diego` sorts
--     before `/akron-recycling` in SQL and after it in JS. The SQL was right —
--     the TS reference now compares by code point (audit-rollup.ts::byText).
--
--   * buildSiteAuditTrend emitted a point for a capture day whose every
--     snapshot was excluded (all resources, all aliases, or — now — all on
--     pages that are gone): 0 pages, null score, a hole in the chart meaning
--     nothing. The SQL twin drops those rows before it groups, so the day never
--     existed there. The TS reference now skips them too. iopbm.com has three
--     such days; every page it captured then is gone today.
--
-- FOUND WHILE HERE, AND FIXED: web.site_audit_trend never got the alias skip.
-- web_audit_rollup_shared_rule_and_alias_skip.sql says it appended the
-- canonical_page_id clause "to each function's page CTE WHERE clause", but the
-- live trend body had only the shared-rule half — the rollup counted a
-- document once while the trend counted it twice. The jest spec has never
-- allowed that (buildSiteAuditTrend CALLS buildSiteAuditRollup, so the alias
-- skip is inside it by construction), so this was a live parity break, not a
-- deliberate difference. The clause is restored below.
--
-- These are full CREATE OR REPLACE bodies rather than the surgical DO-block
-- edits the previous migration used: this change adds a CTE, a join, and two
-- output keys, which no text substitution expresses honestly. The bodies were
-- derived from the LIVE pg_get_functiondef output immediately before applying,
-- so both earlier in-place corrections are carried forward verbatim. The guard
-- below refuses to run if the live functions were NOT in that expected state.

DO $guard$
DECLARE
  body text;
BEGIN
  FOREACH body IN ARRAY ARRAY[
    pg_get_functiondef('web.site_audit_rollup(uuid)'::regprocedure),
    pg_get_functiondef('web.site_audit_trend(uuid)'::regprocedure)
  ] LOOP
    -- Already carrying this change (re-run) — nothing to assert.
    CONTINUE WHEN body LIKE '%is_gone%';
    IF body NOT LIKE '%web.is_resource_content_type(%'
       OR body NOT LIKE '%web.is_machine_resource_url(%' THEN
      RAISE EXCEPTION
        'web.site_audit_* no longer CALLS the shared page-class rule. Refusing to replace it: read migrations/web_audit_rollup_shared_rule_and_alias_skip.sql before touching these functions.';
    END IF;
  END LOOP;
END
$guard$;

-- ---------------------------------------------------------------------------
-- The rollup.
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
    -- THE SHARED CLASSIFICATION RULE — the same two FUNCTIONS v_page_list.is_resource
    -- calls. Never inline either half here: this block previously carried a copy
    -- that drifted within a day and re-hid 97 real pages.
    (web.is_resource_content_type(p.content_type_last)
      OR web.is_machine_resource_url(p.url)) AS is_resource,
    -- GONE: the crawler no longer finds this URL. Its stored metrics describe a
    -- document that no longer resolves, so it earns no HTML-quality finding —
    -- it becomes its own finding below. IS NOT DISTINCT FROM, never `=`: a NULL
    -- status through a bare `=` would drop the page from the audit entirely.
    (p.status IS NOT DISTINCT FROM 'missing') AS is_gone,
    p.last_seen,
    s.seo_metrics,
    s.audit_metrics
  FROM web.page p
  LEFT JOIN web.snapshot s ON s.id = p.latest_snapshot_id
  WHERE p.site_id = p_site_id
    AND p.deleted_at IS NULL
    -- An alias is the same document under a second URL. Counting it would
    -- double every finding on that document. Same rule as v_page_list.is_canonical
    -- and matrx-scraper analysis.py (pages_skipped_alias).
    AND (p.canonical_page_id IS NULL OR p.canonical_page_id = p.id)
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
    AND NOT c.is_gone
), gone_rows AS (
  -- THE GONE FINDING. Traffic comes from the canonical page projection, not a
  -- second aggregate over web.gsc_page_stat — v_page_list already owns the
  -- 28-day window, and a fork of it would drift the first time the window
  -- changed. Resources are excluded here too: a vanished /wp-json endpoint is
  -- not lost traffic.
  SELECT
    c.id, c.url, c.path, c.last_seen,
    v.gsc_clicks_28d,
    v.gsc_impressions_28d
  FROM classified c
  LEFT JOIN web.v_page_list v
    ON v.page_id = c.id AND v.site_id = p_site_id
  WHERE c.is_gone
    AND NOT c.is_resource
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
), gone_count AS (
  SELECT count(*) AS n FROM gone_rows
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
  'gonePages', gone_count.n,
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
           -- pc.id last: two pages CAN share a path (same path, different query
           -- string). Without a unique final key the order of those ties is
           -- arbitrary here AND in the TS reference, and they disagree for no
           -- reason. This is the unstable-ORDER-BY class.
           ORDER BY pc.error_count DESC, pc.warning_count DESC, pc.path, pc.id)
    FROM page_counts pc
    WHERE pc.error_count + pc.warning_count > 0), '[]'::jsonb),
  -- Costliest first. A page with no GSC row at all sorts as zero, below
  -- anything Google still showed.
  'gonePageDetails', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'pageId', g.id,
             'path', g.path,
             'url', g.url,
             'gscClicks28d', g.gsc_clicks_28d,
             'gscImpressions28d', g.gsc_impressions_28d,
             'lastSeen', g.last_seen)
           ORDER BY COALESCE(g.gsc_clicks_28d, 0) DESC,
                    COALESCE(g.gsc_impressions_28d, 0) DESC,
                    g.last_seen DESC NULLS LAST,
                    g.path, g.id)
    FROM gone_rows g), '[]'::jsonb)
)
FROM totals, resource_count, gone_count;
$$;

COMMENT ON FUNCTION web.site_audit_rollup(uuid) IS
  'Server-side site-audit rollup (SiteAuditRollup shape) over web.page + each page''s latest web.snapshot metrics. SECURITY INVOKER — RLS is the ceiling. Excludes machine resources via the shared web.is_resource_content_type / web.is_machine_resource_url rules, alias URLs via canonical_page_id, and GONE pages (status = ''missing'') from every HTML-quality finding — gone pages are reported separately as gonePages / gonePageDetails, ranked by the GSC traffic they were earning. Counting semantics mirror features/marketing/lib/audit-rollup.ts::buildSiteAuditRollup; change one, change both.';

-- ---------------------------------------------------------------------------
-- Score trend — same exclusions, so a day's score can never mean something
-- different from the rollup's. buildSiteAuditTrend calls buildSiteAuditRollup
-- per capture day, so this is forced by parity, not a separate judgement.
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
    AND NOT (web.is_resource_content_type(p.content_type_last)
             OR web.is_machine_resource_url(p.url))
    AND (p.canonical_page_id IS NULL OR p.canonical_page_id = p.id)
    -- Gone pages leave the trend for the same reason they leave the rollup: a
    -- score computed over documents that no longer resolve is not this site's
    -- score. (`is_gone` in the rollup; spelled out here — same rule.)
    AND (p.status IS DISTINCT FROM 'missing')
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
  'Per-UTC-day site audit score trend (AuditTrendPoint[] shape) over every historical web.snapshot. SECURITY INVOKER — RLS is the ceiling. Same exclusions as web.site_audit_rollup (machine resources, alias URLs, gone pages). Mirrors features/marketing/lib/audit-rollup.ts::buildSiteAuditTrend.';

GRANT EXECUTE ON FUNCTION web.site_audit_rollup(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION web.site_audit_trend(uuid) TO authenticated, service_role;
