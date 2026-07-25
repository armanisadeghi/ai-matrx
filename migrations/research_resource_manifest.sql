-- RESEARCH RESOURCE MANIFEST — the inventory of everything a topic holds,
-- with sizes but WITHOUT bodies.
--
-- A research topic accumulates far more than its report: search results, raw
-- Brave payloads, scraped page bodies, per-page AI analyses, page scoring,
-- keyword syntheses, tag consolidations, topic reports, documents, media. The
-- Context Builder lets a human check exactly what an agent should receive, and
-- it must show the real size of each item BEFORE anything is fetched.
--
-- Why an RPC and not client reads: scraped content alone is ~21.8M chars
-- platform-wide, and ONE live topic carries 4.98M chars of it across 108 pages
-- (~46k chars each). Pulling bodies to render a checkbox list would move
-- megabytes to draw a few hundred rows. This function returns one terse row per
-- selectable item — id, label, char count, flags — so the picker costs ONE
-- round trip and bodies are fetched only for what the user actually selected.
--
-- Char counts are measured from the stored text (`length(...)`,
-- `rs_content.char_count`), never estimated. Token figures are derived from
-- these in one client helper (`lib/tokens/estimate.ts`) so the preview and the
-- resolver can never disagree.
--
-- `edges` carries the source⇄keyword rank graph (the rs_source_keywords view
-- over canonical platform.associations) because a source's importance is a
-- function of ALL its per-keyword ranks (features/research/ranking.ts) — the
-- client needs the whole graph to order by importance, and it is tiny next to
-- bodies. `rank_for_keyword` is the only authoritative rank; rs_source.rank is
-- ambiguous and is never used.
--
-- PAYLOAD DISCIPLINE (the largest live topic is 3,303 items):
--   * labels truncated to 140 chars in SQL;
--   * `url` appears ONCE per source, on its `search.result` item — every other
--     source-derived kind carries only `hostname`, and the URL is looked up by
--     source id client-side (or arrives with the body fetch);
--   * flags are jsonb_strip_nulls'd so unranked/unscored rows cost nothing.
--
-- Every item carries `t` — the row's own timestamp — because "newest first" has
-- to mean newest. Without it the client can only guess at recency from row
-- order or size, and an ordering that claims to be chronological but is not is
-- worse than no ordering at all.
--
-- INVOKER rights, exactly like public.get_topic_overview: RLS is the gate and
-- the ONLY gate. rs_topic's entity policy plus each component's deferral to it
-- (iam.has_access) already answer "may this user see this topic's data", so a
-- SECURITY DEFINER wrapper would add a second authority to keep in sync — and a
-- hand-written access check is exactly what the canonical resolver replaces.
--
-- Idempotent: CREATE OR REPLACE only.

CREATE OR REPLACE FUNCTION public.research_topic_resource_manifest(p_topic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_topic  research.rs_topic;
  v_result jsonb;
BEGIN
  -- RLS-filtered: no row here means "not visible to you", which is the same
  -- answer as "does not exist" and is reported as such.
  SELECT * INTO v_topic FROM research.rs_topic WHERE id = p_topic_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'research topic % not found or not accessible', p_topic_id
      USING ERRCODE = 'no_data_found';
  END IF;

  WITH
  -- Latest page-summary analysis per source, so the picker can default to the
  -- current write-up instead of every historical attempt.
  latest_analysis AS (
    SELECT DISTINCT ON (source_id) id, source_id
    FROM research.rs_analysis
    WHERE topic_id = p_topic_id AND agent_type = 'page_summary'
    ORDER BY source_id, updated_at DESC, created_at DESC NULLS LAST, id DESC
  ),

  items AS (
    -- ── search.result — the SERP entry itself (title/description/snippets) ──
    SELECT
      'search.result'::text AS k,
      s.id                  AS id,
      NULL::uuid            AS p,
      left(coalesce(s.title, s.url), 140) AS l,
      s.hostname            AS s2,
      coalesce(length(s.title), 0) + coalesce(length(s.description), 0)
        + coalesce(length(s.extra_snippets::text), 0) AS c,
      s.scrape_status       AS st,
      coalesce(s.last_seen_at, s.discovered_at) AS t,
      jsonb_strip_nulls(jsonb_build_object(
        'included',  s.is_included,
        'authority', s.authority_score,
        'tier',      s.authority_tier,
        'hostname',  s.hostname,
        'url',       s.url,
        'origin',    s.origin,
        'type',      s.source_type
      )) AS f
    FROM research.rs_source s
    WHERE s.topic_id = p_topic_id

    -- ── search.raw — the full provider payload (heavy) ─────────────────────
    UNION ALL
    SELECT
      'search.raw', s.id, NULL::uuid,
      left(coalesce(s.title, s.url), 140), s.hostname,
      length(s.raw_search_result::text), NULL,
      coalesce(s.last_seen_at, s.discovered_at),
      jsonb_strip_nulls(jsonb_build_object(
        'included',  s.is_included,
        'hostname',  s.hostname,
        'authority', s.authority_score,
        'tier',      s.authority_tier
      ))
    FROM research.rs_source s
    WHERE s.topic_id = p_topic_id AND s.raw_search_result IS NOT NULL

    -- ── search.keyword_serp — the raw search API response per keyword ──────
    UNION ALL
    SELECT
      'search.keyword_serp', k.id, k.id,
      left(k.keyword, 140), k.search_provider,
      length(k.raw_api_response::text), NULL,
      k.last_searched_at,
      jsonb_strip_nulls(jsonb_build_object(
        'provider',     k.search_provider,
        'result_count', k.result_count
      ))
    FROM research.rs_keyword k
    WHERE k.topic_id = p_topic_id AND k.raw_api_response IS NOT NULL

    -- ── page.content — the scraped body ───────────────────────────────────
    UNION ALL
    SELECT
      'page.content', c.id, c.source_id,
      left(coalesce(s.title, s.url, 'Untitled page'), 140), s.hostname,
      coalesce(c.char_count, length(c.content), 0),
      CASE WHEN c.is_good_scrape THEN 'success' ELSE 'poor' END,
      coalesce(c.scraped_at, c.updated_at),
      jsonb_strip_nulls(jsonb_build_object(
        'good_scrape', c.is_good_scrape,
        'included',    s.is_included,
        'hostname',    s.hostname,
        'authority',   s.authority_score,
        'tier',        s.authority_tier,
        'edited',      (c.original_content IS NOT NULL),
        'capture',     c.capture_method
      ))
    FROM research.rs_content c
    JOIN research.rs_source s ON s.id = c.source_id
    WHERE c.topic_id = p_topic_id AND c.is_current = true

    -- ── page.analysis — the AI write-up for a page ─────────────────────────
    UNION ALL
    SELECT
      'page.analysis', a.id, a.source_id,
      left(coalesce(s.title, s.url, 'Untitled page'), 140), a.agent_type,
      coalesce(length(a.result), 0), a.status,
      coalesce(a.updated_at, a.created_at),
      jsonb_strip_nulls(jsonb_build_object(
        'agent_type', a.agent_type,
        'latest',     (la.id IS NOT NULL),
        'included',   s.is_included,
        'hostname',   s.hostname,
        'authority',  s.authority_score,
        'tier',       s.authority_tier
      ))
    FROM research.rs_analysis a
    LEFT JOIN research.rs_source s ON s.id = a.source_id
    LEFT JOIN latest_analysis la ON la.id = a.id
    WHERE a.topic_id = p_topic_id

    -- ── page.scoring — pre/post-read scoring + recommended use ─────────────
    UNION ALL
    SELECT
      'page.scoring', s.id, s.id,
      left(coalesce(s.title, s.url), 140), s.recommended_use,
      length(s.page_analysis::text), s.analysis_status,
      coalesce(s.authority_ranked_at, s.updated_at),
      jsonb_strip_nulls(jsonb_build_object(
        'included',        s.is_included,
        'hostname',        s.hostname,
        'pre_read',        s.pre_read_score,
        'post_read',       s.post_read_score,
        'final',           s.final_source_score,
        'recommended_use', s.recommended_use,
        'authority',       s.authority_score,
        'tier',            s.authority_tier
      ))
    FROM research.rs_source s
    WHERE s.topic_id = p_topic_id AND s.page_analysis IS NOT NULL

    -- ── page.links / page.images — what a page pointed at ──────────────────
    UNION ALL
    SELECT
      'page.links', c.id, c.source_id,
      left(coalesce(s.title, s.url), 140), s.hostname,
      length(c.extracted_links::text), NULL,
      coalesce(c.scraped_at, c.updated_at),
      jsonb_strip_nulls(jsonb_build_object(
        'included', s.is_included,
        'hostname', s.hostname,
        'count',    jsonb_array_length(c.extracted_links)
      ))
    FROM research.rs_content c
    JOIN research.rs_source s ON s.id = c.source_id
    WHERE c.topic_id = p_topic_id AND c.is_current = true
      AND jsonb_typeof(c.extracted_links) = 'array'
      AND jsonb_array_length(c.extracted_links) > 0

    UNION ALL
    SELECT
      'page.images', c.id, c.source_id,
      left(coalesce(s.title, s.url), 140), s.hostname,
      length(c.extracted_images::text), NULL,
      coalesce(c.scraped_at, c.updated_at),
      jsonb_strip_nulls(jsonb_build_object(
        'included', s.is_included,
        'hostname', s.hostname,
        'count',    jsonb_array_length(c.extracted_images)
      ))
    FROM research.rs_content c
    JOIN research.rs_source s ON s.id = c.source_id
    WHERE c.topic_id = p_topic_id AND c.is_current = true
      AND jsonb_typeof(c.extracted_images) = 'array'
      AND jsonb_array_length(c.extracted_images) > 0

    -- ── synthesis.keyword — the per-keyword synthesis report ───────────────
    UNION ALL
    SELECT
      'synthesis.keyword', y.id, y.keyword_id,
      left(coalesce(k.keyword, 'Keyword synthesis'), 140), y.model_id,
      coalesce(length(y.result), coalesce(length(y.result_structured::text), 0)),
      y.status,
      coalesce(y.updated_at, y.created_at),
      jsonb_strip_nulls(jsonb_build_object(
        'current',    y.is_current,
        'version',    y.version,
        'keyword_id', y.keyword_id,
        'iteration',  y.iteration_mode
      ))
    FROM research.rs_synthesis y
    LEFT JOIN research.rs_keyword k ON k.id = y.keyword_id
    WHERE y.topic_id = p_topic_id AND y.scope = 'keyword'

    -- ── synthesis.tag — a tag consolidation ────────────────────────────────
    UNION ALL
    SELECT
      'synthesis.tag', y.id, y.tag_id,
      left(coalesce(g.name, 'Tag consolidation'), 140), y.model_id,
      coalesce(length(y.result), coalesce(length(y.result_structured::text), 0)),
      y.status,
      coalesce(y.updated_at, y.created_at),
      jsonb_strip_nulls(jsonb_build_object(
        'current', y.is_current,
        'version', y.version,
        'tag_id',  y.tag_id
      ))
    FROM research.rs_synthesis y
    LEFT JOIN research.rs_tag g ON g.id = y.tag_id
    WHERE y.topic_id = p_topic_id AND y.tag_id IS NOT NULL AND y.scope <> 'keyword'

    -- ── synthesis.topic — the topic-wide report ────────────────────────────
    -- Legacy rows carry scope='project' (renamed to 'topic' in Phase 4).
    UNION ALL
    SELECT
      'synthesis.topic', y.id, NULL::uuid,
      left(coalesce(v_topic.name, 'Topic report'), 140), y.model_id,
      coalesce(length(y.result), coalesce(length(y.result_structured::text), 0)),
      y.status,
      coalesce(y.updated_at, y.created_at),
      jsonb_strip_nulls(jsonb_build_object(
        'current', y.is_current,
        'version', y.version
      ))
    FROM research.rs_synthesis y
    WHERE y.topic_id = p_topic_id
      AND y.scope IN ('topic', 'project') AND y.tag_id IS NULL

    -- ── document.report — the assembled document ───────────────────────────
    UNION ALL
    SELECT
      'document.report', d.id, NULL::uuid,
      left(coalesce(d.title, 'Document'), 140), d.model_id,
      coalesce(length(d.content), 0), d.status,
      coalesce(d.updated_at, d.created_at),
      jsonb_strip_nulls(jsonb_build_object(
        'current', d.is_current,
        'version', d.version
      ))
    FROM research.rs_document d
    WHERE d.topic_id = p_topic_id

    -- ── media.items — every image/video the pipeline captured ──────────────
    UNION ALL
    SELECT
      'media.items', m.id, m.source_id,
      left(coalesce(nullif(m.alt_text, ''), nullif(m.caption, ''), m.url), 140),
      m.media_type,
      coalesce(length(m.alt_text), 0) + coalesce(length(m.caption), 0)
        + coalesce(length(m.url), 0),
      NULL,
      m.created_at,
      jsonb_strip_nulls(jsonb_build_object(
        'relevant',  m.is_relevant,
        'type',      m.media_type,
        'url',       m.url,
        'thumbnail', m.thumbnail_url,
        'width',     m.width,
        'height',    m.height
      ))
    FROM research.rs_media m
    WHERE m.topic_id = p_topic_id
  ),

  edges AS (
    SELECT sk.id AS source_id, sk.keyword_id, sk.rank_for_keyword AS rank
    FROM research.rs_source_keywords sk
    WHERE sk.topic_id = p_topic_id AND sk.keyword_id IS NOT NULL
  )

  SELECT jsonb_build_object(
    'topic_id', p_topic_id,
    'generated_at', now(),
    'topic', jsonb_build_object(
      'id', v_topic.id,
      'name', v_topic.name,
      'description', v_topic.description,
      'tone_profile', v_topic.tone_profile,
      'status', v_topic.status,
      'created_at', v_topic.created_at
    ),
    'keywords', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', k.id, 'keyword', k.keyword, 'position', k.position,
               'searched_at', k.last_searched_at, 'stale', k.is_stale,
               'result_count', k.result_count)
             ORDER BY k.position NULLS LAST, k.created_at)
      FROM research.rs_keyword k WHERE k.topic_id = p_topic_id
    ), '[]'::jsonb),
    'tags', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', g.id, 'name', g.name, 'description', g.description,
               'sort_order', g.sort_order)
             ORDER BY g.sort_order NULLS LAST, g.name)
      FROM research.rs_tag g WHERE g.topic_id = p_topic_id
    ), '[]'::jsonb),
    -- [tag_id, source_id] pairs — canonical association edges, so a selector
    -- can say "every page tagged Leadership" without a second round trip.
    'tag_sources', coalesce((
      SELECT jsonb_agg(jsonb_build_array(a.target_id, a.source_id))
      FROM platform.associations a
      WHERE a.source_type = 'research_source'
        AND a.target_type = 'research_tag'
        AND a.target_id IN (SELECT id FROM research.rs_tag WHERE topic_id = p_topic_id)
    ), '[]'::jsonb),
    -- [source_id, keyword_id, rank_for_keyword] triples.
    'edges', coalesce((
      SELECT jsonb_agg(jsonb_build_array(e.source_id, e.keyword_id, e.rank))
      FROM edges e
    ), '[]'::jsonb),
    'kinds', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'kind', g.k, 'item_count', g.n, 'chars', g.chars)
             ORDER BY g.k)
      FROM (
        SELECT k, count(*) AS n, coalesce(sum(c), 0) AS chars
        FROM items GROUP BY k
      ) g
    ), '[]'::jsonb),
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'k', i.k, 'id', i.id, 'p', i.p, 'l', i.l, 's', i.s2,
               'c', coalesce(i.c, 0), 'st', i.st, 't', i.t, 'f', i.f))
      FROM items i
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.research_topic_resource_manifest(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.research_topic_resource_manifest(uuid) TO authenticated, service_role;
