-- Canonicalization follow-up (2026-07-02): repoint the research.rs_source_keywords
-- VIEW off the graveyarded junction onto platform.associations.
--
-- The rs_keyword_source collapse (research_m2m_collapse_source_tag_keyword.sql)
-- retired research.rs_keyword_source to graveyard, but this view still JOINed
-- graveyard.rs_keyword_source by its old name/columns — so it silently served
-- FROZEN data (nothing writes to the graveyard table post-cutover). Caught by an
-- adversarial verification sweep (a DB view is one layer below the Python where
-- grep can't see it). No app code currently reads the view; repointing it keeps
-- it live-correct rather than leaving a stale time-bomb.
--
-- Column shape is byte-identical to the prior view (keyword_id, rank_for_keyword)
-- so CREATE OR REPLACE VIEW is safe.

CREATE OR REPLACE VIEW research.rs_source_keywords AS
 SELECT s.id,
    s.topic_id,
    s.url,
    s.title,
    s.description,
    s.hostname,
    s.source_type,
    s.origin,
    s.rank,
    s.page_age,
    s.thumbnail_url,
    s.extra_snippets,
    s.raw_search_result,
    s.is_included,
    s.is_stale,
    s.scrape_status,
    s.discovered_at,
    s.last_seen_at,
    a.target_id   AS keyword_id,
    a.position    AS rank_for_keyword
   FROM research.rs_source s
     JOIN platform.associations a
       ON a.source_id = s.id
      AND a.source_type = 'research_source'
      AND a.target_type = 'research_keyword';
