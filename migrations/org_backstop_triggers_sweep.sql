-- org_backstop_triggers_sweep.sql  (2026-08-12, changeover chip task_53fe333d)
--
-- 40 active registered tables carry organization_id NOT NULL with NO filling
-- mechanism (no _stamp_org_default, no inherit_org_from_parent, no column
-- default) — each a latent 500 on any insert that forgets org. Per the base
-- contract (common-docs/systems/db-rules/FEATURE.md §2), the backstop is
-- REQUIRED whenever organization_id is NOT NULL.
--
-- Components inherit org from their platform.entity_relationships composition
-- parent (stamping the creator's personal org would write WRONG tenancy);
-- entities + the one system table default via public._stamp_org_default().
-- Parent choice for multi-parent components: a NOT NULL fk_column, preferring
-- the access-tree head (web.site) where present.
--
-- Additive only: both functions no-op when organization_id is already set, and
-- fall through to the NOT NULL constraint when the org cannot be resolved
-- (loud, never mis-attributed). Idempotent: each attach is guarded by a
-- pg_trigger existence check on BOTH function names, so re-runs and parallel
-- attachments are no-ops.

DO $$
DECLARE
  r record;
BEGIN
  -- Components → BEFORE INSERT trg_inherit_org(parent_schema, parent_table, fk_column)
  FOR r IN
    SELECT * FROM (VALUES
      ('crm','address',                    'crm','party',           'party_id'),
      ('crm','affiliation',                'crm','party',           'party_id'),
      ('crm','campaign_member',            'crm','campaign',        'campaign_id'),
      ('crm','interaction',                'crm','party',           'party_id'),
      ('crm','party_contact_point',        'crm','party',           'party_id'),
      ('crm','party_merge',                'crm','party',           'winner_id'),
      ('seo','ai_visibility_citation',     'web','site',            'site_id'),
      ('seo','ai_visibility_claim',        'web','site',            'site_id'),
      ('seo','ai_visibility_response',     'web','site',            'site_id'),
      ('seo','ai_visibility_signal',       'web','site',            'site_id'),
      ('seo','backlink',                   'web','site',            'site_id'),
      ('seo','backlink_dimension_snapshot','web','site',            'site_id'),
      ('seo','backlink_observation',       'web','site',            'site_id'),
      ('seo','backlink_snapshot',          'web','site',            'site_id'),
      ('seo','change_assessment',          'web','site',            'site_id'),
      ('seo','change_event',               'web','site',            'site_id'),
      ('seo','change_item',                'web','site',            'site_id'),
      ('seo','change_metric',              'web','site',            'site_id'),
      ('seo','change_set',                 'web','site',            'site_id'),
      ('seo','change_theory',              'web','site',            'site_id'),
      ('seo','competitor',                 'web','site',            'site_id'),
      ('seo','competitor_observation',     'seo','competitor',      'competitor_id'),
      ('seo','competitor_opportunity',     'web','site',            'site_id'),
      ('seo','keyword_market_observation', 'seo','collection_run',  'run_id'),
      ('seo','page_performance',           'web','page',            'page_id'),
      ('seo','rank_observation',           'seo','rank_target',     'rank_target_id'),
      ('seo','referring_domain_profile',   'web','site',            'site_id'),
      ('seo','reputation_case',            'web','site',            'site_id'),
      ('seo','search_performance_daily',   'web','site',            'site_id'),
      ('seo','serp_snapshot',              'seo','collection_run',  'run_id'),
      ('seo','site_keyword_value',         'web','site',            'site_id'),
      ('seo','site_topic_value',           'web','site',            'site_id'),
      ('seo','web_analytics_daily',        'web','site',            'site_id')
    ) AS v(child_schema, child_table, parent_schema, parent_table, fk_column)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = tg.tgfoid
      WHERE n.nspname = r.child_schema AND c.relname = r.child_table
        AND NOT tg.tgisinternal
        AND p.proname IN ('inherit_org_from_parent', '_stamp_org_default')
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_inherit_org BEFORE INSERT ON %I.%I
           FOR EACH ROW EXECUTE FUNCTION platform.inherit_org_from_parent(%L, %L, %L)',
        r.child_schema, r.child_table, r.parent_schema, r.parent_table, r.fk_column);
      RAISE NOTICE 'attached trg_inherit_org on %.% (parent %.%.%)',
        r.child_schema, r.child_table, r.parent_schema, r.parent_table, r.fk_column;
    END IF;
  END LOOP;

  -- Entities + the system table → BEFORE INSERT _stamp_org_default()
  FOR r IN
    SELECT * FROM (VALUES
      ('context','scope_types'),
      ('platform','activity_log'),
      ('platform','expertise_pack'),
      ('rag','kg_sweep_state'),
      ('seo','collection_run'),
      ('seo','rank_target'),
      ('research','youtube_video')
    ) AS v(t_schema, t_table)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = tg.tgfoid
      WHERE n.nspname = r.t_schema AND c.relname = r.t_table
        AND NOT tg.tgisinternal
        AND p.proname IN ('inherit_org_from_parent', '_stamp_org_default')
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER _stamp_org_default BEFORE INSERT ON %I.%I
           FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default()',
        r.t_schema, r.t_table);
      RAISE NOTICE 'attached _stamp_org_default on %.%', r.t_schema, r.t_table;
    END IF;
  END LOOP;
END $$;
