-- web direct-Supabase foundation
--
-- Staged migration: apply this hardening before (or atomically with) adding
-- `web` to the project's Data API "Exposed schemas" setting. Persisted
-- marketing/crawler data is read directly from Supabase under the caller's JWT;
-- this migration creates no scraper/Python read proxy.
--
-- The canonical web tables/RLS already exist. This migration only hardens view
-- execution, narrows Data API privileges, provides the site-create write
-- chokepoint, and enforces the site -> component organization invariant.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. View execution security
-- ---------------------------------------------------------------------------

-- These views only read web relations, so caller rights + the underlying web
-- RLS policies are the correct enforcement boundary.
ALTER VIEW web.v_latest_result SET (security_invoker = true);
ALTER VIEW web.v_page_score SET (security_invoker = true);
ALTER VIEW web.v_site_score SET (security_invoker = true);
ALTER VIEW web.v_priority_queue SET (security_invoker = true);

-- Cost is the deliberate exception. v_cost_by_item must read the unexposed
-- runtime.global_execution ledger, so making this base view security_invoker
-- would either fail or require an unsafe runtime grant. Keep owner-rights only
-- for that join, put a security barrier around it, and scope every source row
-- to a site the caller can view. Derived rollups run as the caller and can only
-- aggregate this already-filtered projection.
CREATE OR REPLACE VIEW web.v_cost_by_item
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  bi.id AS batch_item_id,
  bi.site_id,
  bi.batch_id,
  bi.organization_id,
  ar.page_id,
  ar.run_id,
  COALESCE(sum(ge.cost), 0::numeric) AS cost
FROM web.batch_item AS bi
LEFT JOIN web.analysis_result AS ar
  ON ar.id = bi.result_id
LEFT JOIN runtime.global_execution AS linked
  ON linked.link_kind = 'web_batch_item'
 AND linked.link_id = bi.id::text
LEFT JOIN runtime.global_execution AS ge
  ON ge.root_execution_id = linked.root_execution_id
WHERE
  bi.deleted_at IS NULL
  AND iam.has_access('web_site', bi.site_id, 'viewer')
GROUP BY
  bi.id,
  bi.site_id,
  bi.batch_id,
  bi.organization_id,
  ar.page_id,
  ar.run_id;

COMMENT ON VIEW web.v_cost_by_item IS
  'Caller-filtered cost projection. SECURITY DEFINER is required only for the runtime.global_execution join; security_barrier plus web_site viewer access prevents cross-site disclosure.';

ALTER VIEW web.v_cost_by_page SET (security_invoker = true);
ALTER VIEW web.v_cost_by_run SET (security_invoker = true);
ALTER VIEW web.v_cost_by_site SET (security_invoker = true);
ALTER VIEW web.v_cost_by_client SET (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 2. Site-component tenant invariant
-- ---------------------------------------------------------------------------

-- Fail before attaching the trigger if any existing component is orphaned or
-- tenant-mismatched. This migration never guesses how to repair canonical data.
DO $preflight$
DECLARE
  component_table text;
  invalid_count bigint;
BEGIN
  FOREACH component_table IN ARRAY ARRAY[
    'page',
    'crawl_session',
    'snapshot',
    'screenshot',
    'site_item_config',
    'analysis_result',
    'finding',
    'link_edge',
    'batch_job',
    'batch_item'
  ]
  LOOP
    EXECUTE format(
      'SELECT count(*)
         FROM web.%I AS component
         LEFT JOIN web.site AS site ON site.id = component.site_id
        WHERE site.id IS NULL
           OR component.organization_id IS DISTINCT FROM site.organization_id',
      component_table
    )
    INTO invalid_count;

    IF invalid_count > 0 THEN
      RAISE EXCEPTION
        'web.% has % orphaned or organization-mismatched site components',
        component_table,
        invalid_count
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
END;
$preflight$;

CREATE OR REPLACE FUNCTION web.enforce_site_component_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  parent_organization_id uuid;
BEGIN
  IF NEW.site_id IS NULL THEN
    RAISE EXCEPTION 'web.% requires site_id', TG_TABLE_NAME
      USING ERRCODE = '23502';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.site_id IS DISTINCT FROM OLD.site_id THEN
    RAISE EXCEPTION
      'web.% rows cannot be reparented from site % to site %',
      TG_TABLE_NAME,
      OLD.site_id,
      NEW.site_id
      USING ERRCODE = '23514';
  END IF;

  SELECT site.organization_id
    INTO parent_organization_id
    FROM web.site AS site
   WHERE site.id = NEW.site_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'web.site % does not exist', NEW.site_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.organization_id IS NOT NULL
     AND NEW.organization_id IS DISTINCT FROM parent_organization_id THEN
    RAISE EXCEPTION
      'web.% organization_id must match parent site %',
      TG_TABLE_NAME,
      NEW.site_id
      USING ERRCODE = '23514';
  END IF;

  NEW.organization_id := parent_organization_id;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION web.enforce_site_component_organization() IS
  'Reusable BEFORE trigger: derives organization_id from web.site and rejects site reparenting or tenant mismatches.';

DO $attach$
DECLARE
  component_table text;
BEGIN
  FOREACH component_table IN ARRAY ARRAY[
    'page',
    'crawl_session',
    'snapshot',
    'screenshot',
    'site_item_config',
    'analysis_result',
    'finding',
    'link_edge',
    'batch_job',
    'batch_item'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS _enforce_site_component_organization ON web.%I',
      component_table
    );
    EXECUTE format(
      'CREATE TRIGGER _enforce_site_component_organization
         BEFORE INSERT OR UPDATE ON web.%I
         FOR EACH ROW
         EXECUTE FUNCTION web.enforce_site_component_organization()',
      component_table
    );
  END LOOP;
END;
$attach$;

-- ---------------------------------------------------------------------------
-- 3. Canonical site creation
-- ---------------------------------------------------------------------------

-- Direct table INSERT remains revoked. The caller selects an organization via
-- this RPC; the function validates membership before its owner-rights INSERT.
-- Canonical triggers still stamp actors/timestamps. The browser then invokes
-- the scraper's direct authenticated homepage-bootstrap command; this RPC
-- does not proxy that command or pretend an asynchronous capture is complete.
CREATE OR REPLACE FUNCTION web.create_site(
  p_organization_id uuid,
  p_name text,
  p_root_url text,
  p_domain text,
  p_settings jsonb DEFAULT '{}'::jsonb,
  p_integrations jsonb DEFAULT '{}'::jsonb,
  p_visibility platform.visibility DEFAULT 'private'::platform.visibility
)
RETURNS web.site
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  created_site web.site;
  normalized_name text := NULLIF(btrim(p_name), '');
  normalized_root_url text := NULLIF(btrim(p_root_url), '');
  normalized_domain text := lower(NULLIF(btrim(p_domain), ''));
  root_host text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF p_organization_id IS NULL
     OR NOT iam.has_org_access(p_organization_id) THEN
    RAISE EXCEPTION 'Organization access required'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_name IS NULL THEN
    RAISE EXCEPTION 'Site name is required'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_root_url IS NULL
     OR normalized_root_url !~* '^https?://' THEN
    RAISE EXCEPTION 'root_url must be an absolute HTTP(S) URL'
      USING ERRCODE = '22023';
  END IF;

  -- `domain` is the site's exact normalized host and must not be an
  -- independent caller-controlled identity. Credentials and non-HTTP schemes
  -- are deliberately rejected; path scope belongs in settings.
  root_host := lower(
    substring(
      normalized_root_url
      FROM '^https?://([^/:?#@]+)(?::[0-9]+)?(?:[/?#]|$)'
    )
  );

  IF root_host IS NULL THEN
    RAISE EXCEPTION 'root_url must contain a valid host and no credentials'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_domain IS NULL
     OR normalized_domain LIKE '%://%'
     OR normalized_domain LIKE '%/%' THEN
    RAISE EXCEPTION 'domain must be a normalized host without a scheme or path'
      USING ERRCODE = '22023';
  END IF;

  normalized_domain := regexp_replace(normalized_domain, '\.$', '');
  root_host := regexp_replace(root_host, '\.$', '');

  IF normalized_domain = '' THEN
    RAISE EXCEPTION 'domain must not be empty'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_domain IS DISTINCT FROM root_host THEN
    RAISE EXCEPTION 'domain must exactly match the root_url host'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_settings, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'settings must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_integrations, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'integrations must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO web.site (
    organization_id,
    name,
    root_url,
    domain,
    settings,
    integrations,
    visibility
  )
  VALUES (
    p_organization_id,
    normalized_name,
    normalized_root_url,
    normalized_domain,
    COALESCE(p_settings, '{}'::jsonb),
    COALESCE(p_integrations, '{}'::jsonb),
    COALESCE(p_visibility, 'private'::platform.visibility)
  )
  RETURNING * INTO created_site;

  RETURN created_site;
END;
$function$;

COMMENT ON FUNCTION web.create_site(uuid, text, text, text, jsonb, jsonb, platform.visibility) IS
  'Authenticated site-create chokepoint. Validates organization access, normalizes identity fields, and relies on canonical web.site triggers for base-column stamping.';

-- ---------------------------------------------------------------------------
-- 4. Data API grants: revoke first, then grant only current UI operations
-- ---------------------------------------------------------------------------

REVOKE ALL PRIVILEGES ON SCHEMA web FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA web TO anon, authenticated;
GRANT USAGE ON SCHEMA web TO service_role;

REVOKE ALL PRIVILEGES ON TABLE
  web.site,
  web.page,
  web.crawl_session,
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
FROM PUBLIC, anon, authenticated;

-- Anonymous access is intentionally limited to public web.site rows. RLS's
-- pub_read policy remains the row filter.
GRANT SELECT ON TABLE web.site TO anon;

-- Authenticated reads are direct from Supabase. RLS resolves every site-owned
-- component through web.site; shared catalogs keep their system-variant RLS.
GRANT SELECT ON TABLE
  web.site,
  web.page,
  web.crawl_session,
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

-- The direct scraper/worker uses the project's service role for canonical
-- persistence. BYPASSRLS does not imply relation privileges, so grant the
-- explicit read/write surface it needs while keeping schema DDL owner-only.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA web
TO service_role;

-- Site identity is stable after creation; client edits are settings/lifecycle
-- fields only. Crawlers and integration workers use service_role for derived
-- status, screenshot pointers, and captured data.
GRANT UPDATE (
  name,
  status,
  visibility,
  integrations,
  settings,
  metadata,
  deleted_at
) ON TABLE web.site TO authenticated;

-- Manual canonical-page creation and user-owned SEO metadata. Crawl-derived
-- first/last-seen, HTTP status, and latest_snapshot_id remain worker-only.
GRANT INSERT (
  site_id,
  url,
  url_hash,
  path,
  provenance,
  status,
  target_keyword,
  meta_title_desired,
  meta_description_desired,
  metadata
) ON TABLE web.page TO authenticated;

GRANT UPDATE (
  status,
  target_keyword,
  meta_title_desired,
  meta_description_desired,
  metadata,
  deleted_at
) ON TABLE web.page TO authenticated;

-- Custom catalog rows are org-stamped by canonical root triggers. Built-in
-- flags and stable keys are not client-mutable.
GRANT INSERT (
  visibility,
  key,
  label,
  description,
  category,
  subcategory,
  kind_definition_id,
  weight,
  score_contract,
  severity_map,
  default_provider_id,
  metadata
) ON TABLE web.analysis_item TO authenticated;

GRANT UPDATE (
  visibility,
  label,
  description,
  category,
  subcategory,
  kind_definition_id,
  weight,
  score_contract,
  severity_map,
  default_provider_id,
  metadata,
  deleted_at
) ON TABLE web.analysis_item TO authenticated;

GRANT INSERT (
  visibility,
  key,
  label,
  kind,
  config,
  metadata
) ON TABLE web.provider TO authenticated;

GRANT UPDATE (
  visibility,
  label,
  kind,
  config,
  metadata,
  deleted_at
) ON TABLE web.provider TO authenticated;

GRANT INSERT (
  site_id,
  item_id,
  provider_id,
  enabled,
  cadence,
  config,
  metadata
) ON TABLE web.site_item_config TO authenticated;

GRANT UPDATE (
  provider_id,
  enabled,
  cadence,
  config,
  metadata,
  deleted_at
) ON TABLE web.site_item_config TO authenticated;

GRANT UPDATE (
  status,
  suppressed,
  suppressed_reason,
  resolved_at,
  metadata,
  deleted_at
) ON TABLE web.finding TO authenticated;

-- Exposed-schema functions default to PUBLIC EXECUTE in Postgres. Revoke the
-- entire web function surface (including administrative web.conform) and open
-- only the authenticated create_site RPC.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA web FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION web.create_site(
  uuid,
  text,
  text,
  text,
  jsonb,
  jsonb,
  platform.visibility
) TO authenticated;

-- Future objects remain closed until a migration grants their exact surface.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA web
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA web
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA web
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

-- ---------------------------------------------------------------------------
-- 5. In-transaction verification
-- ---------------------------------------------------------------------------

DO $verify$
DECLARE
  invoker_view text;
  trigger_count integer;
  view_options text[];
BEGIN
  FOREACH invoker_view IN ARRAY ARRAY[
    'v_latest_result',
    'v_page_score',
    'v_site_score',
    'v_priority_queue',
    'v_cost_by_run',
    'v_cost_by_page',
    'v_cost_by_site',
    'v_cost_by_client'
  ]
  LOOP
    SELECT relation.reloptions
      INTO view_options
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'web'
       AND relation.relname = invoker_view
       AND relation.relkind = 'v';

    IF NOT FOUND
       OR NOT (
         'security_invoker=true' = ANY(COALESCE(view_options, ARRAY[]::text[]))
         OR 'security_invoker=on' = ANY(COALESCE(view_options, ARRAY[]::text[]))
       ) THEN
      RAISE EXCEPTION 'web.% is not security_invoker', invoker_view;
    END IF;
  END LOOP;

  SELECT relation.reloptions
    INTO view_options
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
   WHERE namespace.nspname = 'web'
     AND relation.relname = 'v_cost_by_item'
     AND relation.relkind = 'v';

  IF NOT FOUND
     OR NOT (
       'security_barrier=true' = ANY(COALESCE(view_options, ARRAY[]::text[]))
       OR 'security_barrier=on' = ANY(COALESCE(view_options, ARRAY[]::text[]))
     )
     OR 'security_invoker=true' = ANY(COALESCE(view_options, ARRAY[]::text[]))
     OR 'security_invoker=on' = ANY(COALESCE(view_options, ARRAY[]::text[])) THEN
    RAISE EXCEPTION 'web.v_cost_by_item must be a caller-filtered security-barrier owner-rights view';
  END IF;

  SELECT count(*)
    INTO trigger_count
    FROM pg_catalog.pg_trigger AS trigger
    JOIN pg_catalog.pg_class AS relation
      ON relation.oid = trigger.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
   WHERE namespace.nspname = 'web'
     AND trigger.tgname = '_enforce_site_component_organization'
     AND NOT trigger.tgisinternal;

  IF trigger_count <> 10 THEN
    RAISE EXCEPTION
      'Expected 10 web site-component organization triggers, found %',
      trigger_count;
  END IF;

  IF NOT pg_catalog.has_schema_privilege('anon', 'web', 'USAGE')
     OR NOT pg_catalog.has_schema_privilege('authenticated', 'web', 'USAGE')
     OR NOT pg_catalog.has_schema_privilege('service_role', 'web', 'USAGE') THEN
    RAISE EXCEPTION 'Data API roles are missing web schema USAGE';
  END IF;

  IF NOT pg_catalog.has_table_privilege('anon', 'web.site', 'SELECT')
     OR pg_catalog.has_table_privilege('anon', 'web.page', 'SELECT') THEN
    RAISE EXCEPTION 'anonymous web relation grants are broader or narrower than intended';
  END IF;

  IF NOT pg_catalog.has_table_privilege('authenticated', 'web.page', 'SELECT')
     OR NOT pg_catalog.has_column_privilege(
       'authenticated',
       'web.page',
       'target_keyword',
       'UPDATE'
     ) THEN
    RAISE EXCEPTION 'authenticated web read/write grants are incomplete';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
       'service_role',
       'web.snapshot',
       'INSERT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'service_role',
       'web.crawl_session',
       'UPDATE'
     ) THEN
    RAISE EXCEPTION 'service_role web persistence grants are incomplete';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
       'authenticated',
       'web.create_site(uuid,text,text,text,jsonb,jsonb,platform.visibility)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon',
       'web.create_site(uuid,text,text,text,jsonb,jsonb,platform.visibility)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'web.create_site EXECUTE grants are incorrect';
  END IF;
END;
$verify$;

-- Project-setting verification (cannot be made authoritative by a migration):
--   Dashboard -> Settings -> API -> Exposed schemas must include `web`.
--   SELECT current_setting('pgrst.db_schemas', true);
-- After application, regenerate committed artifacts (never hand-edit them):
--   pnpm db-types
--   pnpm check:schema
-- Canonical spot checks:
--   SELECT * FROM iam.verify_canonical('web', 'site', 'web_site', 'entity');
--   SELECT * FROM iam.verify_canonical('web', 'page', 'web_page', 'component');

NOTIFY pgrst, 'reload schema';

COMMIT;
