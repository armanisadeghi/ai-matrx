-- Marketing crawler core authorities
--
-- Adds the four approved site-owned concepts that cannot be derived safely
-- from snapshots or canonical pages:
--   * crawl_url: per-session URL discovery/outcome facts
--   * crawl_event: durable, ordered replay/log events
--   * page_evidence: independent source support for canonical URLs
--   * crawl_schedule: site-specific schedule definitions
--
-- Every row derives access and organization ownership from web.site. No
-- platform association/reachability rows are created for these components.

BEGIN;

CREATE TABLE web.crawl_url (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES iam.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  site_id uuid NOT NULL REFERENCES web.site(id),
  session_id uuid NOT NULL REFERENCES web.crawl_session(id),
  sequence bigint NOT NULL,
  raw_url text NOT NULL,
  normalized_url text,
  url_hash text NOT NULL,
  discovery_source text NOT NULL DEFAULT 'link',
  discovered_from_page_id uuid REFERENCES web.page(id),
  classification text NOT NULL,
  outcome text NOT NULL,
  is_in_scope boolean NOT NULL DEFAULT true,
  depth integer NOT NULL DEFAULT 0,
  http_status integer,
  final_url text,
  reason_code text,
  reason text,
  page_id uuid REFERENCES web.page(id),
  snapshot_id uuid REFERENCES web.snapshot(id),
  discovered_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  CONSTRAINT crawl_url_sequence_nonnegative CHECK (sequence >= 0),
  CONSTRAINT crawl_url_depth_nonnegative CHECK (depth >= 0),
  CONSTRAINT crawl_url_http_status_valid CHECK (
    http_status IS NULL OR http_status BETWEEN 100 AND 599
  ),
  CONSTRAINT crawl_url_discovery_source_valid CHECK (
    discovery_source IN (
      'seed',
      'link',
      'sitemap',
      'gsc',
      'manual',
      'redirect',
      'canonical',
      'other'
    )
  ),
  CONSTRAINT crawl_url_classification_valid CHECK (
    classification IN ('internal', 'external', 'asset', 'invalid', 'excluded')
  ),
  CONSTRAINT crawl_url_outcome_valid CHECK (
    outcome IN (
      'discovered',
      'captured',
      'redirected',
      'skipped',
      'excluded',
      'failed',
      'duplicate',
      'cancelled'
    )
  ),
  CONSTRAINT crawl_url_completed_order CHECK (
    completed_at IS NULL OR completed_at >= discovered_at
  ),
  CONSTRAINT crawl_url_capture_pointer CHECK (
    outcome <> 'captured' OR snapshot_id IS NOT NULL
  ),
  CONSTRAINT crawl_url_session_sequence_unique UNIQUE (session_id, sequence)
);

CREATE INDEX crawl_url_session_outcome_idx
  ON web.crawl_url (session_id, outcome, sequence);
CREATE INDEX crawl_url_session_hash_idx
  ON web.crawl_url (session_id, url_hash);
CREATE INDEX crawl_url_site_page_idx
  ON web.crawl_url (site_id, page_id)
  WHERE page_id IS NOT NULL;

SELECT web.conform(
  'crawl_url',
  'web_crawl_url',
  'Web Crawl URL',
  'component',
  'site_id',
  false,
  false
);

CREATE TABLE web.crawl_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES iam.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  site_id uuid NOT NULL REFERENCES web.site(id),
  session_id uuid NOT NULL REFERENCES web.crawl_session(id),
  sequence bigint NOT NULL,
  event_type text NOT NULL,
  phase text,
  level text NOT NULL DEFAULT 'info',
  message text,
  page_id uuid REFERENCES web.page(id),
  crawl_url_id uuid REFERENCES web.crawl_url(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT crawl_event_sequence_nonnegative CHECK (sequence >= 0),
  CONSTRAINT crawl_event_type_nonempty CHECK (btrim(event_type) <> ''),
  CONSTRAINT crawl_event_level_valid CHECK (
    level IN ('debug', 'info', 'warning', 'error')
  ),
  CONSTRAINT crawl_event_payload_object CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT crawl_event_session_sequence_unique UNIQUE (session_id, sequence)
);

CREATE INDEX crawl_event_session_time_idx
  ON web.crawl_event (session_id, occurred_at, sequence);
CREATE INDEX crawl_event_session_type_idx
  ON web.crawl_event (session_id, event_type, sequence);

SELECT web.conform(
  'crawl_event',
  'web_crawl_event',
  'Web Crawl Event',
  'component',
  'site_id',
  false,
  false
);

CREATE TABLE web.page_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES iam.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  site_id uuid NOT NULL REFERENCES web.site(id),
  page_id uuid NOT NULL REFERENCES web.page(id),
  source_type text NOT NULL,
  source_binding_id uuid,
  external_key text,
  is_present boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT page_evidence_source_valid CHECK (
    source_type IN ('manual', 'crawl', 'sitemap', 'gsc', 'ga4', 'cms')
  ),
  CONSTRAINT page_evidence_times_valid CHECK (last_seen_at >= first_seen_at),
  CONSTRAINT page_evidence_checked_valid CHECK (
    last_checked_at IS NULL OR last_checked_at >= first_seen_at
  ),
  CONSTRAINT page_evidence_payload_object CHECK (
    jsonb_typeof(evidence) = 'object'
  )
);

CREATE UNIQUE INDEX page_evidence_source_identity_uq
  ON web.page_evidence (
    page_id,
    source_type,
    COALESCE(source_binding_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(external_key, '')
  )
  WHERE deleted_at IS NULL;
CREATE INDEX page_evidence_site_source_idx
  ON web.page_evidence (site_id, source_type, is_present, last_seen_at DESC)
  WHERE deleted_at IS NULL;

SELECT web.conform(
  'page_evidence',
  'web_page_evidence',
  'Web Page Evidence',
  'component',
  'site_id',
  true,
  true
);

CREATE TABLE web.crawl_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES iam.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  site_id uuid NOT NULL REFERENCES web.site(id),
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  cadence jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  timezone text NOT NULL DEFAULT 'UTC',
  respect_robots boolean NOT NULL DEFAULT false,
  screenshot_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduler_task_id uuid,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_session_id uuid REFERENCES web.crawl_session(id),

  CONSTRAINT crawl_schedule_name_nonempty CHECK (btrim(name) <> ''),
  CONSTRAINT crawl_schedule_cadence_object CHECK (
    jsonb_typeof(cadence) = 'object'
  ),
  CONSTRAINT crawl_schedule_scope_object CHECK (jsonb_typeof(scope) = 'object'),
  CONSTRAINT crawl_schedule_screenshot_policy_object CHECK (
    jsonb_typeof(screenshot_policy) = 'object'
  )
);

CREATE INDEX crawl_schedule_due_idx
  ON web.crawl_schedule (next_run_at, site_id)
  WHERE enabled AND deleted_at IS NULL;
CREATE INDEX crawl_schedule_site_idx
  ON web.crawl_schedule (site_id, enabled, name)
  WHERE deleted_at IS NULL;

SELECT web.conform(
  'crawl_schedule',
  'web_crawl_schedule',
  'Web Crawl Schedule',
  'component',
  'site_id',
  true,
  true
);

-- The foundation migration creates this reusable tenant guard. Attach it to
-- every new site component after web.conform installs the canonical triggers.
DO $attach_organization_guard$
DECLARE
  component_table text;
BEGIN
  IF to_regprocedure('web.enforce_site_component_organization()') IS NULL THEN
    RAISE EXCEPTION
      'web.enforce_site_component_organization() is required; apply web_direct_supabase_foundation first';
  END IF;

  FOREACH component_table IN ARRAY ARRAY[
    'crawl_url',
    'crawl_event',
    'page_evidence',
    'crawl_schedule'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER _enforce_site_component_organization
         BEFORE INSERT OR UPDATE ON web.%I
         FOR EACH ROW
         EXECUTE FUNCTION web.enforce_site_component_organization()',
      component_table
    );
  END LOOP;
END;
$attach_organization_guard$;

-- Durable crawl facts are append-only. The crawler inserts terminal URL facts
-- and ordered events; corrections are new events, never silent history edits.
CREATE OR REPLACE FUNCTION web.reject_crawl_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'web.% is append-only; insert a new fact instead', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER _reject_crawl_fact_mutation
  BEFORE UPDATE OR DELETE ON web.crawl_url
  FOR EACH ROW EXECUTE FUNCTION web.reject_crawl_fact_mutation();
CREATE TRIGGER _reject_crawl_fact_mutation
  BEFORE UPDATE OR DELETE ON web.crawl_event
  FOR EACH ROW EXECUTE FUNCTION web.reject_crawl_fact_mutation();

-- Authenticated clients read directly through Supabase. Only schedule
-- definitions are user-authored in this slice; crawler facts/evidence are
-- worker-written under service_role.
GRANT SELECT ON TABLE
  web.crawl_url,
  web.crawl_event,
  web.page_evidence,
  web.crawl_schedule
TO authenticated;

GRANT INSERT (
  site_id,
  name,
  enabled,
  cadence,
  scope,
  timezone,
  respect_robots,
  screenshot_policy,
  metadata
) ON TABLE web.crawl_schedule TO authenticated;

GRANT UPDATE (
  name,
  enabled,
  cadence,
  scope,
  timezone,
  respect_robots,
  screenshot_policy,
  metadata,
  deleted_at
) ON TABLE web.crawl_schedule TO authenticated;

REVOKE EXECUTE ON FUNCTION web.reject_crawl_fact_mutation()
FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  table_name text;
  token text;
  failed_checks integer;
BEGIN
  FOR table_name, token IN
    SELECT *
      FROM (
        VALUES
          ('crawl_url', 'web_crawl_url'),
          ('crawl_event', 'web_crawl_event'),
          ('page_evidence', 'web_page_evidence'),
          ('crawl_schedule', 'web_crawl_schedule')
      ) AS expected(table_name, token)
  LOOP
    SELECT count(*)
      INTO failed_checks
      FROM iam.verify_canonical('web', table_name, token, 'component')
     WHERE status NOT IN ('PASS', 'SKIP');

    IF failed_checks > 0 THEN
      RAISE EXCEPTION 'web.% failed % canonical checks', table_name, failed_checks;
    END IF;
  END LOOP;

  IF NOT pg_catalog.has_table_privilege(
       'authenticated',
       'web.crawl_url',
       'SELECT'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'web.crawl_url',
       'INSERT'
     ) THEN
    RAISE EXCEPTION 'crawl fact grants are incorrect';
  END IF;

  IF NOT pg_catalog.has_column_privilege(
       'authenticated',
       'web.crawl_schedule',
       'enabled',
       'UPDATE'
     ) THEN
    RAISE EXCEPTION 'crawl schedule grants are incomplete';
  END IF;
END;
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
