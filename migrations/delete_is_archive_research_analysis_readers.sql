-- based-on: public.get_topic_overview(uuid) 0233ecea3b3e022c3dfe3bd712382568ec4d6e5c39e58ab8bb46df9c64e2d4d5
-- based-on: public.research_topic_resource_manifest(uuid) 445dff1be9ec3341432bdcd33c0f5360174fd2a5948b0f65e5cae484a0f7d21d
-- Delete means archive (Arman, 2026-09-27), lane F: research.rs_analysis.
-- Retrying a failed page analysis now moves the failed attempt to Trash
-- (deleted_at) instead of destroying it. Two readers must skip trashed
-- analyses, or a trashed failed attempt keeps counting as the page's latest
-- analysis (overview failed count, manifest "latest" flag and items):
--   * get_topic_overview — latest_page_analyses
--   * research_topic_resource_manifest — latest_analysis and the page.analysis arm
-- Each body is the live body with only "deleted_at IS NULL" added.

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
      AND deleted_at IS NULL
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
  kw_edges AS (
    SELECT a.target_id AS keyword_id, a.source_id
    FROM platform.associations_live a
    WHERE a.source_type = 'research_source'
      AND a.target_type = 'research_keyword'
      AND a.target_id IN (
        SELECT id FROM research.rs_keyword WHERE topic_id = p_topic_id
      )
  ),
  kw_synth AS (
    SELECT DISTINCT keyword_id
    FROM research.rs_synthesis
    WHERE topic_id = p_topic_id
      AND scope = 'keyword'
      AND is_current = true
      AND status = 'success'
      AND keyword_id IS NOT NULL
  ),
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

    'pending', json_build_object(
      'keywords_unsearched',        (SELECT unsearched FROM kw_pending),
      'keywords_pending_scrape',    (SELECT pending_scrape FROM kw_pending),
      'keywords_pending_analysis',  (SELECT pending_analysis FROM kw_pending),
      'keywords_pending_synthesis', (SELECT pending_synthesis FROM kw_pending),
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

CREATE OR REPLACE FUNCTION public.research_topic_resource_manifest(p_topic_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_topic research.rs_topic; v_result jsonb;
BEGIN
  SELECT * INTO v_topic FROM research.rs_topic WHERE id = p_topic_id;
  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('research topic %s not found or not accessible', p_topic_id));
  END IF;
  WITH latest_analysis AS (
    SELECT DISTINCT ON (source_id) id, source_id FROM research.rs_analysis
    WHERE topic_id=p_topic_id AND agent_type='page_summary' AND deleted_at IS NULL
    ORDER BY source_id, updated_at DESC, created_at DESC NULLS LAST, id DESC
  ),
  items AS (
    SELECT 'search.result'::text AS k, s.id AS id, NULL::uuid AS p,
      left(coalesce(s.title,s.url),140) AS l, s.hostname AS s2,
      coalesce(length(s.url),0) + coalesce(length(s.page_age),0)
        + coalesce(length(s.title),0) + coalesce(length(s.description),0)
        + coalesce(length(s.extra_snippets::text),0) AS c,
      s.scrape_status AS st, coalesce(s.last_seen_at,s.discovered_at) AS t,
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'authority',s.authority_score,
        'tier',s.authority_tier,'hostname',s.hostname,'url',s.url,'origin',s.origin,'type',s.source_type)) AS f
    FROM research.rs_source s WHERE s.topic_id=p_topic_id
    UNION ALL
    SELECT 'search.raw', s.id, NULL::uuid, left(coalesce(s.title,s.url),140), s.hostname,
      length(s.raw_search_result::text), NULL, coalesce(s.last_seen_at,s.discovered_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'authority',s.authority_score,'tier',s.authority_tier))
    FROM research.rs_source s WHERE s.topic_id=p_topic_id AND s.raw_search_result IS NOT NULL
    UNION ALL
    SELECT 'search.keyword_serp', k.id, k.id, left(k.keyword,140), k.search_provider,
      length(k.raw_api_response::text), NULL, k.last_searched_at,
      jsonb_strip_nulls(jsonb_build_object('provider',k.search_provider,'result_count',k.result_count))
    FROM research.rs_keyword k WHERE k.topic_id=p_topic_id AND k.raw_api_response IS NOT NULL
    UNION ALL
    SELECT 'page.content', c.id, c.source_id, left(coalesce(s.title,s.url,'Untitled page'),140), s.hostname,
      coalesce(c.char_count,length(c.content),0),
      CASE WHEN c.is_good_scrape THEN 'success' ELSE 'poor' END,
      coalesce(c.scraped_at,c.updated_at),
      jsonb_strip_nulls(jsonb_build_object('good_scrape',c.is_good_scrape,'included',s.is_included,
        'hostname',s.hostname,'authority',s.authority_score,'tier',s.authority_tier,
        'edited',(c.original_content IS NOT NULL),'capture',c.capture_method))
    FROM research.rs_content c JOIN research.rs_source s ON s.id=c.source_id
    WHERE c.topic_id=p_topic_id AND c.is_current=true
    UNION ALL
    SELECT 'page.analysis', a.id, a.source_id, left(coalesce(s.title,s.url,'Untitled page'),140), a.agent_type,
      coalesce(length(a.result),0), a.status, coalesce(a.updated_at,a.created_at),
      jsonb_strip_nulls(jsonb_build_object('agent_type',a.agent_type,'latest',(la.id IS NOT NULL),
        'included',s.is_included,'hostname',s.hostname,'authority',s.authority_score,'tier',s.authority_tier))
    FROM research.rs_analysis a LEFT JOIN research.rs_source s ON s.id=a.source_id
    LEFT JOIN latest_analysis la ON la.id=a.id WHERE a.topic_id=p_topic_id AND a.deleted_at IS NULL
    UNION ALL
    SELECT 'page.scoring', s.id, s.id, left(coalesce(s.title,s.url),140), s.recommended_use,
      length(s.page_analysis::text), s.analysis_status, coalesce(s.authority_ranked_at,s.updated_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'pre_read',s.pre_read_score,'post_read',s.post_read_score,'final',s.final_source_score,
        'recommended_use',s.recommended_use,'authority',s.authority_score,'tier',s.authority_tier))
    FROM research.rs_source s WHERE s.topic_id=p_topic_id AND s.page_analysis IS NOT NULL
    UNION ALL
    SELECT 'page.links', c.id, c.source_id, left(coalesce(s.title,s.url),140), s.hostname,
      length(c.extracted_links::text), NULL, coalesce(c.scraped_at,c.updated_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'count',jsonb_array_length(c.extracted_links)))
    FROM research.rs_content c JOIN research.rs_source s ON s.id=c.source_id
    WHERE c.topic_id=p_topic_id AND c.is_current=true AND jsonb_typeof(c.extracted_links)='array'
      AND jsonb_array_length(c.extracted_links)>0
    UNION ALL
    SELECT 'page.images', c.id, c.source_id, left(coalesce(s.title,s.url),140), s.hostname,
      length(c.extracted_images::text), NULL, coalesce(c.scraped_at,c.updated_at),
      jsonb_strip_nulls(jsonb_build_object('included',s.is_included,'hostname',s.hostname,
        'count',jsonb_array_length(c.extracted_images)))
    FROM research.rs_content c JOIN research.rs_source s ON s.id=c.source_id
    WHERE c.topic_id=p_topic_id AND c.is_current=true AND jsonb_typeof(c.extracted_images)='array'
      AND jsonb_array_length(c.extracted_images)>0
    UNION ALL
    SELECT 'synthesis.keyword', y.id, y.keyword_id, left(coalesce(k.keyword,'Keyword synthesis'),140), y.model_id,
      coalesce(length(y.result),coalesce(length(y.result_structured::text),0)), y.status,
      coalesce(y.updated_at,y.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',y.is_current,'version',y.version,
        'keyword_id',y.keyword_id,'iteration',y.iteration_mode))
    FROM research.rs_synthesis y LEFT JOIN research.rs_keyword k ON k.id=y.keyword_id
    WHERE y.topic_id=p_topic_id AND y.scope='keyword'
    UNION ALL
    SELECT 'synthesis.tag', y.id, y.tag_id, left(coalesce(g.name,'Tag consolidation'),140), y.model_id,
      coalesce(length(y.result),coalesce(length(y.result_structured::text),0)), y.status,
      coalesce(y.updated_at,y.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',y.is_current,'version',y.version,'tag_id',y.tag_id))
    FROM research.rs_synthesis y LEFT JOIN research.rs_tag g ON g.id=y.tag_id
    WHERE y.topic_id=p_topic_id AND y.tag_id IS NOT NULL AND y.scope<>'keyword'
    UNION ALL
    SELECT 'synthesis.topic', y.id, NULL::uuid, left(coalesce(v_topic.name,'Topic report'),140), y.model_id,
      coalesce(length(y.result),coalesce(length(y.result_structured::text),0)), y.status,
      coalesce(y.updated_at,y.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',y.is_current,'version',y.version))
    FROM research.rs_synthesis y WHERE y.topic_id=p_topic_id
      AND y.scope IN ('topic','project') AND y.tag_id IS NULL
    UNION ALL
    SELECT 'document.report', d.id, NULL::uuid, left(coalesce(d.title,'Document'),140), d.model_id,
      coalesce(length(d.content),0), d.status, coalesce(d.updated_at,d.created_at),
      jsonb_strip_nulls(jsonb_build_object('current',d.is_current,'version',d.version))
    FROM research.rs_document d WHERE d.topic_id=p_topic_id
    UNION ALL
    SELECT 'media.items', m.id, m.source_id,
      left(coalesce(nullif(m.alt_text,''),nullif(m.caption,''),m.url),140), m.media_type,
      coalesce(length(m.alt_text),0)+coalesce(length(m.caption),0)+coalesce(length(m.url),0),
      NULL, m.created_at,
      jsonb_strip_nulls(jsonb_build_object('relevant',m.is_relevant,'type',m.media_type,'url',m.url,
        'thumbnail',m.thumbnail_url,'width',m.width,'height',m.height))
    FROM research.rs_media m WHERE m.topic_id=p_topic_id
  ),
  edges AS (
    SELECT sk.id AS source_id, sk.keyword_id, sk.rank_for_keyword AS rank
    FROM research.rs_source_keywords sk WHERE sk.topic_id=p_topic_id AND sk.keyword_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'topic_id',p_topic_id,'generated_at',now(),
    'topic',jsonb_build_object('id',v_topic.id,'name',v_topic.name,'description',v_topic.description,
      'tone_profile',v_topic.tone_profile,'status',v_topic.status,'created_at',v_topic.created_at),
    'keywords',coalesce((SELECT jsonb_agg(jsonb_build_object('id',k.id,'keyword',k.keyword,'position',k.position,
      'searched_at',k.last_searched_at,'stale',k.is_stale,'result_count',k.result_count)
      ORDER BY k.position NULLS LAST,k.created_at) FROM research.rs_keyword k WHERE k.topic_id=p_topic_id),'[]'::jsonb),
    'tags',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'description',g.description,
      'sort_order',g.sort_order) ORDER BY g.sort_order NULLS LAST,g.name)
      FROM research.rs_tag g WHERE g.topic_id=p_topic_id),'[]'::jsonb),
    'tag_sources',coalesce((SELECT jsonb_agg(jsonb_build_array(a.target_id,a.source_id))
      FROM platform.associations_live a WHERE a.source_type='research_source' AND a.target_type='research_tag'
        AND a.target_id IN (SELECT id FROM research.rs_tag WHERE topic_id=p_topic_id)),'[]'::jsonb),
    'edges',coalesce((SELECT jsonb_agg(jsonb_build_array(e.source_id,e.keyword_id,e.rank)) FROM edges e),'[]'::jsonb),
    'kinds',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',g.k,'item_count',g.n,'chars',g.chars) ORDER BY g.k)
      FROM (SELECT k,count(*) AS n,coalesce(sum(c),0) AS chars FROM items GROUP BY k) g),'[]'::jsonb),
    'items',coalesce((SELECT jsonb_agg(jsonb_build_object('k',i.k,'id',i.id,'p',i.p,'l',i.l,'s',i.s2,
      'c',coalesce(i.c,0),'st',i.st,'t',i.t,'f',i.f)) FROM items i),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $function$;
