-- Keep the direct-to-Supabase marketing surface explicit and auditable.
-- RLS decides which rows an authenticated caller can see; these grants only
-- allow PostgREST to reach those policies. Anonymous access remains limited to
-- public web.site rows.

GRANT USAGE ON SCHEMA web TO anon, authenticated, service_role;

GRANT SELECT ON TABLE
  web.site,
  web.page,
  web.crawl_session,
  web.crawl_url,
  web.crawl_event,
  web.page_evidence,
  web.crawl_schedule,
  web.snapshot,
  web.screenshot,
  web.analysis_item,
  web.provider,
  web.site_item_config,
  web.analysis_result,
  web.finding,
  web.link_edge,
  web.batch_job,
  web.batch_item,
  web.v_latest_result,
  web.v_page_score,
  web.v_site_score,
  web.v_priority_queue,
  web.v_cost_by_item,
  web.v_cost_by_run,
  web.v_cost_by_page,
  web.v_cost_by_site,
  web.v_cost_by_client
TO authenticated;

GRANT SELECT ON TABLE web.site TO anon;

GRANT UPDATE (
  name, status, visibility, integrations, settings, metadata, deleted_at
) ON TABLE web.site TO authenticated;

GRANT INSERT (
  site_id, url, url_hash, path, provenance, status, target_keyword,
  meta_title_desired, meta_description_desired, metadata
) ON TABLE web.page TO authenticated;
GRANT UPDATE (
  status, target_keyword, meta_title_desired, meta_description_desired,
  metadata, deleted_at
) ON TABLE web.page TO authenticated;

GRANT INSERT (
  visibility, key, label, description, category, subcategory,
  kind_definition_id, weight, score_contract, severity_map,
  default_provider_id, metadata
) ON TABLE web.analysis_item TO authenticated;
GRANT UPDATE (
  visibility, label, description, category, subcategory, kind_definition_id,
  weight, score_contract, severity_map, default_provider_id, metadata,
  deleted_at
) ON TABLE web.analysis_item TO authenticated;

GRANT INSERT (
  visibility, key, label, kind, config, metadata
) ON TABLE web.provider TO authenticated;
GRANT UPDATE (
  visibility, label, kind, config, metadata, deleted_at
) ON TABLE web.provider TO authenticated;

GRANT INSERT (
  site_id, item_id, provider_id, enabled, cadence, config, metadata
) ON TABLE web.site_item_config TO authenticated;
GRANT UPDATE (
  provider_id, enabled, cadence, config, metadata, deleted_at
) ON TABLE web.site_item_config TO authenticated;

GRANT UPDATE (
  status, suppressed, suppressed_reason, resolved_at, metadata, deleted_at
) ON TABLE web.finding TO authenticated;

GRANT INSERT (
  site_id, name, enabled, cadence, scope, timezone, respect_robots,
  screenshot_policy, metadata
) ON TABLE web.crawl_schedule TO authenticated;
GRANT UPDATE (
  name, enabled, cadence, scope, timezone, respect_robots,
  screenshot_policy, metadata, deleted_at
) ON TABLE web.crawl_schedule TO authenticated;

GRANT EXECUTE ON FUNCTION web.create_site(
  uuid, text, text, text, jsonb, jsonb, platform.visibility
) TO authenticated;
GRANT EXECUTE ON FUNCTION web.cost_for_batch_item(uuid, uuid)
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA web
TO service_role;

DO $verify$
DECLARE
  relation_name text;
  view_name text;
  rls_missing text[];
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'site', 'page', 'crawl_session', 'crawl_url', 'crawl_event',
    'page_evidence', 'crawl_schedule', 'snapshot', 'screenshot',
    'analysis_item', 'provider', 'site_item_config', 'analysis_result',
    'finding', 'link_edge', 'batch_job', 'batch_item'
  ]
  LOOP
    IF NOT pg_catalog.has_table_privilege(
      'authenticated', format('web.%I', relation_name), 'SELECT'
    ) THEN
      RAISE EXCEPTION 'authenticated is missing SELECT on web.%', relation_name;
    END IF;
  END LOOP;

  SELECT array_agg(relation.relname ORDER BY relation.relname)
    INTO rls_missing
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
   WHERE namespace.nspname = 'web'
     AND relation.relkind IN ('r', 'p')
     AND NOT relation.relrowsecurity;

  IF rls_missing IS NOT NULL THEN
    RAISE EXCEPTION 'web tables missing RLS: %', rls_missing;
  END IF;

  FOREACH view_name IN ARRAY ARRAY[
    'v_latest_result', 'v_page_score', 'v_site_score', 'v_priority_queue',
    'v_cost_by_item', 'v_cost_by_run', 'v_cost_by_page', 'v_cost_by_site',
    'v_cost_by_client'
  ]
  LOOP
    IF NOT pg_catalog.has_table_privilege(
      'authenticated', format('web.%I', view_name), 'SELECT'
    ) THEN
      RAISE EXCEPTION 'authenticated is missing SELECT on web.%', view_name;
    END IF;
  END LOOP;

  IF NOT pg_catalog.has_column_privilege(
    'authenticated', 'web.page', 'target_keyword', 'UPDATE'
  ) OR NOT pg_catalog.has_function_privilege(
    'authenticated',
    'web.create_site(uuid,text,text,text,jsonb,jsonb,platform.visibility)',
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'authenticated', 'web.cost_for_batch_item(uuid,uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated web mutation or RPC contract is incomplete';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'web.page', 'SELECT') THEN
    RAISE EXCEPTION 'anonymous access must not extend to site-owned web.page rows';
  END IF;
END;
$verify$;

NOTIFY pgrst, 'reload schema';
