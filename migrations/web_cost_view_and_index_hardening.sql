-- Harden the direct cost projection and add query-critical FK indexes.
--
-- A SECURITY DEFINER view is too broad a primitive even with a caller filter.
-- Keep the view itself security-invoker/RLS-scoped and isolate the one required
-- owner-rights runtime lookup in a narrow function that revalidates site access
-- and the batch-item/site pair on every call.

BEGIN;

CREATE OR REPLACE FUNCTION web.cost_for_batch_item(
  p_batch_item_id uuid,
  p_site_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  total_cost numeric;
BEGIN
  IF auth.uid() IS NULL
     OR NOT iam.has_access('web_site', p_site_id, 'viewer') THEN
    RAISE EXCEPTION 'Site viewer access required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM web.batch_item AS item
     WHERE item.id = p_batch_item_id
       AND item.site_id = p_site_id
       AND item.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Batch item does not belong to the requested site'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(sum(execution.cost), 0::numeric)
    INTO total_cost
    FROM runtime.global_execution AS execution
   WHERE execution.root_execution_id IN (
     SELECT DISTINCT linked.root_execution_id
       FROM runtime.global_execution AS linked
      WHERE linked.link_kind = 'web_batch_item'
        AND linked.link_id = p_batch_item_id::text
   );

  RETURN COALESCE(total_cost, 0::numeric);
END;
$function$;

REVOKE EXECUTE ON FUNCTION web.cost_for_batch_item(uuid, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION web.cost_for_batch_item(uuid, uuid)
TO authenticated;

CREATE OR REPLACE VIEW web.v_cost_by_item
WITH (security_invoker = true, security_barrier = true)
AS
SELECT
  item.id AS batch_item_id,
  item.site_id,
  item.batch_id,
  item.organization_id,
  result.page_id,
  result.run_id,
  web.cost_for_batch_item(item.id, item.site_id) AS cost
FROM web.batch_item AS item
LEFT JOIN web.analysis_result AS result
  ON result.id = item.result_id
WHERE item.deleted_at IS NULL;

COMMENT ON VIEW web.v_cost_by_item IS
  'RLS-scoped batch-item cost projection. Only the runtime sum is delegated to a narrow, site-validating owner-rights function.';

GRANT SELECT ON TABLE web.v_cost_by_item TO authenticated, service_role;

-- web.conform is owner/migration-only after the foundation revoke. Lock its
-- search path as well so the canonical helper is safe under every invocation.
ALTER FUNCTION web.conform(text, text, text, text, text, boolean, boolean)
  SET search_path = '';

-- Query-critical reverse lookups and pointer validations. Actor/audit FKs are
-- intentionally not indexed merely to silence a lint; these cover product
-- joins, rollups, reconciliation, and worker persistence paths.
CREATE INDEX analysis_item_default_provider_idx
  ON web.analysis_item (default_provider_id)
  WHERE default_provider_id IS NOT NULL;
CREATE INDEX analysis_item_kind_definition_idx
  ON web.analysis_item (kind_definition_id);

CREATE INDEX analysis_result_item_idx
  ON web.analysis_result (item_id, computed_at DESC);
CREATE INDEX analysis_result_provider_idx
  ON web.analysis_result (provider_id, computed_at DESC);
CREATE INDEX analysis_result_payload_idx
  ON web.analysis_result (payload_instance_id)
  WHERE payload_instance_id IS NOT NULL;
CREATE INDEX analysis_result_batch_idx
  ON web.analysis_result (batch_id)
  WHERE batch_id IS NOT NULL;

CREATE INDEX batch_item_item_idx ON web.batch_item (item_id);
CREATE INDEX batch_item_provider_idx ON web.batch_item (provider_id);
CREATE INDEX batch_item_result_idx
  ON web.batch_item (result_id)
  WHERE result_id IS NOT NULL;
CREATE INDEX batch_job_provider_idx ON web.batch_job (provider_id);

CREATE INDEX finding_item_idx ON web.finding (item_id, status);
CREATE INDEX finding_first_result_idx
  ON web.finding (first_result_id)
  WHERE first_result_id IS NOT NULL;
CREATE INDEX finding_last_result_idx
  ON web.finding (last_result_id)
  WHERE last_result_id IS NOT NULL;

CREATE INDEX link_edge_snapshot_idx ON web.link_edge (snapshot_id);
CREATE INDEX page_latest_snapshot_idx
  ON web.page (latest_snapshot_id)
  WHERE latest_snapshot_id IS NOT NULL;
CREATE INDEX screenshot_snapshot_idx
  ON web.screenshot (snapshot_id)
  WHERE snapshot_id IS NOT NULL;
CREATE INDEX site_homepage_screenshot_idx
  ON web.site (homepage_screenshot_id)
  WHERE homepage_screenshot_id IS NOT NULL;
CREATE INDEX site_item_config_item_idx ON web.site_item_config (item_id);
CREATE INDEX site_item_config_provider_idx
  ON web.site_item_config (provider_id)
  WHERE provider_id IS NOT NULL;

CREATE INDEX crawl_url_discovered_page_idx
  ON web.crawl_url (discovered_from_page_id)
  WHERE discovered_from_page_id IS NOT NULL;
CREATE INDEX crawl_url_snapshot_idx
  ON web.crawl_url (snapshot_id)
  WHERE snapshot_id IS NOT NULL;
CREATE INDEX crawl_event_page_idx
  ON web.crawl_event (page_id)
  WHERE page_id IS NOT NULL;
CREATE INDEX crawl_event_url_idx
  ON web.crawl_event (crawl_url_id)
  WHERE crawl_url_id IS NOT NULL;
CREATE INDEX crawl_schedule_last_session_idx
  ON web.crawl_schedule (last_session_id)
  WHERE last_session_id IS NOT NULL;

DO $verify$
DECLARE
  view_options text[];
BEGIN
  SELECT relation.reloptions
    INTO view_options
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
   WHERE namespace.nspname = 'web'
     AND relation.relname = 'v_cost_by_item';

  IF NOT ('security_invoker=true' = ANY(COALESCE(view_options, ARRAY[]::text[])))
     OR NOT ('security_barrier=true' = ANY(COALESCE(view_options, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'v_cost_by_item must be an invoker security-barrier view';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
       'authenticated',
       'web.cost_for_batch_item(uuid,uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'web.cost_for_batch_item(uuid,uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'cost_for_batch_item EXECUTE grants are incorrect';
  END IF;
END;
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
