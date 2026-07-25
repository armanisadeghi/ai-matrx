-- Research pipeline READINESS LEDGER.
--
-- `get_topic_overview` previously answered only "how much exists?". That is not
-- enough to tell a user whether their topic is DONE: a topic with 4 keywords, 3
-- of them researched, has data at every stage and therefore looked uniformly
-- green while a whole keyword sat unprocessed. Silent incompleteness is the
-- exact failure this ledger kills.
--
-- The new `pending` block answers "what work is OUTSTANDING, and which
-- downstream artifacts are now stale?" — per stage, mirroring the backend
-- orchestrator's real gates so the UI never promises work the pipeline would
-- refuse to do:
--
--   * search   → aidream research/service.py:1687   `if not kw.last_searched_at`
--   * scrape   → aidream research/scraper.py:552-565 quota walk against
--                `scrapes_per_keyword`, candidate filter at :504-526
--   * analyze  → aidream research/service.py:1074-1141 top-`analyses_per_keyword`
--                per keyword, minus sources that already have a success row
--   * kw synth → aidream research/service.py:1144-1202 skip keywords that
--                already hold a current successful synthesis
--
-- Staleness (report/document) is a strict recency comparison: an artifact built
-- BEFORE the newest input it should have consumed is stale, never silently.
--
-- Idempotent: CREATE OR REPLACE only.

CREATE OR REPLACE FUNCTION public.get_topic_overview(p_topic_id uuid)
RETURNS json
LANGUAGE sql
STABLE
AS $function$
  WITH cfg AS (
    SELECT
      coalesce(t.max_keywords, 0)            AS max_keywords,
      coalesce(t.scrapes_per_keyword, 0)     AS scrapes_per_keyword,
      coalesce(t.analyses_per_keyword, 0)    AS analyses_per_keyword,
      coalesce(t.max_keyword_syntheses, 0)   AS max_keyword_syntheses,
      coalesce(t.max_topic_syntheses, 0)     AS max_topic_syntheses,
      coalesce(t.max_documents, 0)           AS max_documents
    FROM research.rs_topic t
    WHERE t.id = p_topic_id
  ),
  latest_page_analyses AS (
    SELECT DISTINCT ON (source_id)
      source_id,
      status
    FROM research.rs_analysis
    WHERE topic_id = p_topic_id
      AND agent_type = 'page_summary'
    ORDER BY
      source_id,
      updated_at DESC,
      created_at DESC NULLS LAST,
      id DESC
  ),
  analysis_counts AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE status = 'failed') AS failed
    FROM latest_page_analyses
  ),
  source_counts AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE is_included = true) AS included
    FROM research.rs_source
    WHERE topic_id = p_topic_id
  ),
  sources_by_status AS (
    SELECT coalesce(json_object_agg(scrape_status, count), '{}'::json) AS counts
    FROM (
      SELECT scrape_status, count(*) AS count
      FROM research.rs_source
      WHERE topic_id = p_topic_id
      GROUP BY scrape_status
    ) grouped
  ),

  -- ── Readiness inputs ────────────────────────────────────────────────────
  -- Source⇄keyword edges live on platform.associations (the rs_keyword_source
  -- table is gone; research.rs_source_keywords is the view over this join).
  kw_edges AS (
    SELECT a.target_id AS keyword_id, a.source_id
    FROM platform.associations a
    WHERE a.source_type = 'research_source'
      AND a.target_type = 'research_keyword'
      AND a.target_id IN (
        SELECT id FROM research.rs_keyword WHERE topic_id = p_topic_id
      )
  ),
  -- One current successful synthesis per keyword is what the orchestrator
  -- checks before spending on another.
  kw_synth AS (
    SELECT DISTINCT keyword_id
    FROM research.rs_synthesis
    WHERE topic_id = p_topic_id
      AND scope = 'keyword'
      AND is_current = true
      AND status = 'success'
      AND keyword_id IS NOT NULL
  ),
  -- Per-keyword coverage. `scrape_eligible` replicates the backend candidate
  -- filter so debt is never reported for sources the scraper would refuse.
  kw_cov AS (
    SELECT
      k.id AS keyword_id,
      (k.last_searched_at IS NULL) AS unsearched,
      count(s.id) FILTER (
        WHERE s.is_included = true
          AND coalesce(s.policy_category, '') NOT IN ('gated_login', 'low_value')
          AND (
            s.scrape_status IN ('pending', 'success')
            OR (s.scrape_status = 'skipped' AND coalesce(s.server_attempts, 0) = 0)
          )
      ) AS scrape_eligible,
      count(s.id) FILTER (
        WHERE s.is_included = true AND s.scrape_status = 'success'
      ) AS good_scrapes,
      count(s.id) FILTER (
        WHERE s.is_included = true
          AND s.scrape_status = 'success'
          AND lpa.status = 'success'
      ) AS analyzed,
      (kws.keyword_id IS NOT NULL) AS has_synthesis
    FROM research.rs_keyword k
    LEFT JOIN kw_edges e ON e.keyword_id = k.id
    LEFT JOIN research.rs_source s ON s.id = e.source_id
    LEFT JOIN latest_page_analyses lpa ON lpa.source_id = s.id
    LEFT JOIN kw_synth kws ON kws.keyword_id = k.id
    WHERE k.topic_id = p_topic_id
    GROUP BY k.id, k.last_searched_at, kws.keyword_id
  ),
  -- Keyword counts are reported as KEYWORDS with outstanding work, never as a
  -- sum of per-keyword source debt: sources are shared across keywords, so a
  -- summed figure would double-count and lie.
  kw_pending AS (
    SELECT
      count(*) FILTER (WHERE c.unsearched) AS unsearched,
      count(*) FILTER (
        WHERE NOT c.unsearched
          AND least(cfg.scrapes_per_keyword, c.scrape_eligible) > c.good_scrapes
      ) AS pending_scrape,
      count(*) FILTER (
        WHERE least(cfg.analyses_per_keyword, c.good_scrapes) > c.analyzed
      ) AS pending_analysis,
      count(*) FILTER (
        WHERE NOT c.has_synthesis AND c.analyzed > 0
      ) AS pending_synthesis
    FROM kw_cov c
    CROSS JOIN cfg
  ),
  -- Newest current successful artifact per level, for the recency comparisons.
  newest AS (
    SELECT
      (SELECT max(created_at) FROM research.rs_synthesis
        WHERE topic_id = p_topic_id AND scope = 'keyword'
          AND is_current = true AND status = 'success')          AS kw_synth_at,
      (SELECT max(created_at) FROM research.rs_synthesis
        WHERE topic_id = p_topic_id AND scope IN ('topic', 'project')
          AND is_current = true AND status = 'success')          AS topic_synth_at,
      (SELECT max(created_at) FROM research.rs_document
        WHERE topic_id = p_topic_id AND is_current = true)       AS document_at
  )

  SELECT json_build_object(
    'total_keywords',
      (SELECT count(*) FROM research.rs_keyword WHERE topic_id = p_topic_id),
    'stale_keywords',
      (SELECT count(*) FROM research.rs_keyword WHERE topic_id = p_topic_id AND is_stale = true),
    'total_sources',
      (SELECT total FROM source_counts),
    'included_sources',
      (SELECT included FROM source_counts),
    'sources_by_status',
      (SELECT counts FROM sources_by_status),
    'total_content',
      (SELECT count(*) FROM research.rs_content WHERE topic_id = p_topic_id AND is_current = true),
    'total_analyses',
      (SELECT total FROM analysis_counts),
    'total_eligible_for_analysis',
      (SELECT count(*) FROM research.rs_content
       WHERE topic_id = p_topic_id AND is_good_scrape = true AND is_current = true),
    'failed_analyses',
      (SELECT failed FROM analysis_counts),
    'keyword_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope = 'keyword' AND is_current = true),
    'failed_keyword_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope = 'keyword'
         AND is_current = true AND status = 'failed'),
    'topic_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope IN ('topic', 'project') AND is_current = true),
    'failed_topic_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope IN ('topic', 'project')
         AND is_current = true AND status = 'failed'),
    -- Compatibility aliases for older non-frontend consumers.
    'project_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope IN ('topic', 'project') AND is_current = true),
    'failed_project_syntheses',
      (SELECT count(*) FROM research.rs_synthesis
       WHERE topic_id = p_topic_id AND scope IN ('topic', 'project')
         AND is_current = true AND status = 'failed'),
    'total_tags',
      (SELECT count(*) FROM research.rs_tag WHERE topic_id = p_topic_id),
    'total_documents',
      (SELECT count(*) FROM research.rs_document WHERE topic_id = p_topic_id),

    -- ── Readiness ledger ────────────────────────────────────────────────
    'pending', json_build_object(
      -- Keywords with outstanding work at each stage.
      'keywords_unsearched',        (SELECT unsearched FROM kw_pending),
      'keywords_pending_scrape',    (SELECT pending_scrape FROM kw_pending),
      'keywords_pending_analysis',  (SELECT pending_analysis FROM kw_pending),
      'keywords_pending_synthesis', (SELECT pending_synthesis FROM kw_pending),

      -- Downstream artifacts built before the newest input they should hold.
      'report_stale', (
        SELECT n.topic_synth_at IS NOT NULL
           AND n.kw_synth_at IS NOT NULL
           AND n.kw_synth_at > n.topic_synth_at
        FROM newest n
      ),
      'document_stale', (
        SELECT n.document_at IS NOT NULL
           AND n.topic_synth_at IS NOT NULL
           AND n.topic_synth_at > n.document_at
        FROM newest n
      ),

      -- Quota headroom. Negative is impossible; a zero means the next add is
      -- silently dropped by the orchestrator unless the cap is raised first.
      'keyword_slots_remaining', (
        SELECT greatest(0, cfg.max_keywords
          - (SELECT count(*) FROM research.rs_keyword WHERE topic_id = p_topic_id))
        FROM cfg
      ),
      'keyword_synthesis_slots_remaining', (
        SELECT greatest(0, cfg.max_keyword_syntheses
          - (SELECT count(*) FROM kw_synth))
        FROM cfg
      ),
      'topic_synthesis_slots_remaining', (
        SELECT greatest(0, cfg.max_topic_syntheses
          - (SELECT count(*) FROM research.rs_synthesis
             WHERE topic_id = p_topic_id AND scope IN ('topic', 'project')
               AND is_current = true))
        FROM cfg
      ),
      'document_slots_remaining', (
        SELECT greatest(0, cfg.max_documents
          - (SELECT count(*) FROM research.rs_document
             WHERE topic_id = p_topic_id AND is_current = true))
        FROM cfg
      )
    )
  );
$function$;
