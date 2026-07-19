-- Marketing crawler integrity and lifecycle contracts
--
-- RLS answers who may reach a row. These checks separately prove that every
-- denormalized pointer agrees with the row's site, page, subject, item, batch,
-- and crawl identity. The web schema starts empty, so no repair/backfill or
-- legacy-data accommodation is required.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Domain/status/score contracts
-- ---------------------------------------------------------------------------

ALTER TABLE web.page
  ADD CONSTRAINT page_provenance_valid
    CHECK (provenance IN ('gsc', 'sitemap', 'crawl', 'manual')),
  ADD CONSTRAINT page_status_valid
    CHECK (status IN ('active', 'missing', 'gone')),
  ADD CONSTRAINT page_seen_order_valid
    CHECK (last_seen >= first_seen),
  ADD CONSTRAINT page_http_status_valid
    CHECK (http_status_last IS NULL OR http_status_last BETWEEN 100 AND 599);

ALTER TABLE web.crawl_session
  ADD CONSTRAINT crawl_session_status_valid
    CHECK (status IN ('queued', 'running', 'complete', 'failed', 'partial')),
  ADD CONSTRAINT crawl_session_trigger_valid
    CHECK (trigger IN ('manual', 'scheduled')),
  ADD CONSTRAINT crawl_session_scope_object
    CHECK (jsonb_typeof(scope) = 'object'),
  ADD CONSTRAINT crawl_session_stats_object
    CHECK (jsonb_typeof(stats) = 'object'),
  ADD CONSTRAINT crawl_session_time_order
    CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at);

ALTER TABLE web.screenshot
  ADD CONSTRAINT screenshot_kind_valid
    CHECK (kind IN ('homepage', 'page', 'full', 'viewport')),
  ADD CONSTRAINT screenshot_width_valid CHECK (width IS NULL OR width > 0),
  ADD CONSTRAINT screenshot_height_valid CHECK (height IS NULL OR height > 0);

ALTER TABLE web.analysis_result
  ALTER COLUMN run_id DROP NOT NULL,
  ADD CONSTRAINT analysis_result_subject_type_valid
    CHECK (subject_type IN ('site', 'page', 'snapshot')),
  ADD CONSTRAINT analysis_result_status_valid
    CHECK (status IN ('pass', 'warn', 'fail', 'error', 'n_a')),
  ADD CONSTRAINT analysis_result_severity_valid
    CHECK (severity IN ('info', 'low', 'med', 'high', 'critical')),
  ADD CONSTRAINT analysis_result_status_score_valid
    CHECK (
      (status IN ('n_a', 'error') AND score IS NULL)
      OR (status IN ('pass', 'warn', 'fail') AND score BETWEEN 1 AND 100)
    ),
  ADD CONSTRAINT analysis_result_confidence_valid
    CHECK (confidence BETWEEN 0 AND 1),
  ADD CONSTRAINT analysis_result_issue_count_valid CHECK (issue_count >= 0);

ALTER TABLE web.finding
  ADD CONSTRAINT finding_subject_type_valid
    CHECK (subject_type IN ('site', 'page', 'snapshot')),
  ADD CONSTRAINT finding_severity_valid
    CHECK (severity IN ('info', 'low', 'med', 'high', 'critical')),
  ADD CONSTRAINT finding_status_valid
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'reopened')),
  ADD CONSTRAINT finding_detected_order_valid
    CHECK (last_detected_at >= first_detected_at),
  ADD CONSTRAINT finding_resolution_valid
    CHECK (
      (status = 'resolved' AND resolved_at IS NOT NULL)
      OR (status <> 'resolved' AND resolved_at IS NULL)
    ),
  ADD CONSTRAINT finding_suppression_reason_valid
    CHECK (NOT suppressed OR NULLIF(btrim(suppressed_reason), '') IS NOT NULL);

DROP INDEX web.finding_open_uniq;
CREATE UNIQUE INDEX finding_open_uniq
  ON web.finding (site_id, subject_type, subject_id, item_id)
  WHERE status <> 'resolved' AND deleted_at IS NULL;

ALTER TABLE web.link_edge
  ADD CONSTRAINT link_edge_http_status_valid
    CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  ADD CONSTRAINT link_edge_position_valid
    CHECK (position IS NULL OR position >= 0);

ALTER TABLE web.batch_job
  ADD CONSTRAINT batch_job_kind_valid CHECK (kind IN ('llm', 'vision')),
  ADD CONSTRAINT batch_job_status_valid
    CHECK (status IN ('queued', 'submitted', 'processing', 'complete', 'failed')),
  ADD CONSTRAINT batch_job_counts_object CHECK (jsonb_typeof(counts) = 'object'),
  ADD CONSTRAINT batch_job_time_order CHECK (
    completed_at IS NULL OR submitted_at IS NULL OR completed_at >= submitted_at
  );

ALTER TABLE web.batch_item
  ADD CONSTRAINT batch_item_subject_type_valid
    CHECK (subject_type IN ('site', 'page', 'snapshot')),
  ADD CONSTRAINT batch_item_status_valid
    CHECK (
      status IN (
        'queued',
        'submitted',
        'processing',
        'complete',
        'failed',
        'cancelled'
      )
    ),
  ADD CONSTRAINT batch_item_result_state_valid CHECK (
    (status = 'complete' AND result_id IS NOT NULL)
    OR (status <> 'complete' AND result_id IS NULL)
  );

-- ---------------------------------------------------------------------------
-- 2. Cross-pointer site and identity validation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION web.assert_component_site(
  p_relation regclass,
  p_id uuid,
  p_site_id uuid,
  p_label text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actual_site_id uuid;
BEGIN
  IF p_id IS NULL THEN
    RETURN;
  END IF;

  actual_site_id := NULL;
  EXECUTE format('SELECT site_id FROM %s WHERE id = $1', p_relation)
    INTO actual_site_id
    USING p_id;

  -- All canonical component site_id columns are NOT NULL, so NULL here means
  -- the dynamic lookup returned no row (`EXECUTE` does not update FOUND).
  IF actual_site_id IS NULL THEN
    RAISE EXCEPTION '% % does not exist', p_label, p_id
      USING ERRCODE = '23503';
  END IF;

  IF actual_site_id IS DISTINCT FROM p_site_id THEN
    RAISE EXCEPTION '% % belongs to another site', p_label, p_id
      USING ERRCODE = '23514';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION web.validate_cross_pointers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  pointer_page_id uuid;
  pointer_session_id uuid;
  pointer_item_id uuid;
  pointer_item_key text;
  pointer_category text;
  pointer_subcategory text;
  pointer_subject_type text;
  pointer_subject_id uuid;
  pointer_provider_id uuid;
  pointer_batch_id uuid;
  pointer_kind text;
  pointer_http_status integer;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'site' THEN
      IF NEW.homepage_screenshot_id IS NOT NULL THEN
        PERFORM web.assert_component_site(
          'web.screenshot'::regclass,
          NEW.homepage_screenshot_id,
          NEW.id,
          'homepage screenshot'
        );
        SELECT kind INTO pointer_kind
          FROM web.screenshot WHERE id = NEW.homepage_screenshot_id;
        IF pointer_kind <> 'homepage' THEN
          RAISE EXCEPTION 'site homepage_screenshot_id must point to kind=homepage'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'page' THEN
      IF NEW.latest_snapshot_id IS NOT NULL THEN
        PERFORM web.assert_component_site(
          'web.snapshot'::regclass,
          NEW.latest_snapshot_id,
          NEW.site_id,
          'latest snapshot'
        );
        SELECT page_id, http_status
          INTO pointer_page_id, pointer_http_status
          FROM web.snapshot WHERE id = NEW.latest_snapshot_id;
        IF pointer_page_id IS DISTINCT FROM NEW.id
           OR pointer_http_status IS NULL
           OR pointer_http_status NOT BETWEEN 200 AND 399 THEN
          RAISE EXCEPTION 'latest snapshot must be a successful capture of this page'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'snapshot' THEN
      PERFORM web.assert_component_site(
        'web.page'::regclass, NEW.page_id, NEW.site_id, 'snapshot page'
      );
      PERFORM web.assert_component_site(
        'web.crawl_session'::regclass,
        NEW.session_id,
        NEW.site_id,
        'snapshot crawl session'
      );

    WHEN 'screenshot' THEN
      PERFORM web.assert_component_site(
        'web.page'::regclass, NEW.page_id, NEW.site_id, 'screenshot page'
      );
      PERFORM web.assert_component_site(
        'web.snapshot'::regclass,
        NEW.snapshot_id,
        NEW.site_id,
        'screenshot snapshot'
      );
      IF NEW.snapshot_id IS NOT NULL THEN
        SELECT page_id INTO pointer_page_id
          FROM web.snapshot WHERE id = NEW.snapshot_id;
        IF NEW.page_id IS DISTINCT FROM pointer_page_id THEN
          RAISE EXCEPTION 'screenshot page must match its snapshot page'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'analysis_result' THEN
      PERFORM web.assert_component_site(
        'web.page'::regclass, NEW.page_id, NEW.site_id, 'result page'
      );
      PERFORM web.assert_component_site(
        'web.crawl_session'::regclass,
        NEW.run_id,
        NEW.site_id,
        'result crawl session'
      );
      PERFORM web.assert_component_site(
        'web.batch_job'::regclass, NEW.batch_id, NEW.site_id, 'result batch'
      );

      SELECT key, category, subcategory
        INTO pointer_item_key, pointer_category, pointer_subcategory
        FROM web.analysis_item WHERE id = NEW.item_id;
      IF NOT FOUND
         OR NEW.item_key IS DISTINCT FROM pointer_item_key
         OR NEW.category IS DISTINCT FROM pointer_category
         OR NEW.subcategory IS DISTINCT FROM pointer_subcategory THEN
        RAISE EXCEPTION 'result item denormalization does not match analysis_item'
          USING ERRCODE = '23514';
      END IF;

      IF NEW.subject_type = 'site' THEN
        IF NEW.subject_id IS DISTINCT FROM NEW.site_id OR NEW.page_id IS NOT NULL THEN
          RAISE EXCEPTION 'site result subject is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      ELSIF NEW.subject_type = 'page' THEN
        IF NEW.page_id IS NULL OR NEW.subject_id IS DISTINCT FROM NEW.page_id THEN
          RAISE EXCEPTION 'page result subject is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      ELSE
        PERFORM web.assert_component_site(
          'web.snapshot'::regclass,
          NEW.subject_id,
          NEW.site_id,
          'result snapshot subject'
        );
        SELECT page_id INTO pointer_page_id
          FROM web.snapshot WHERE id = NEW.subject_id;
        IF NEW.page_id IS DISTINCT FROM pointer_page_id THEN
          RAISE EXCEPTION 'snapshot result page is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'finding' THEN
      PERFORM web.assert_component_site(
        'web.page'::regclass, NEW.page_id, NEW.site_id, 'finding page'
      );

      IF NEW.subject_type = 'site' THEN
        IF NEW.subject_id IS DISTINCT FROM NEW.site_id OR NEW.page_id IS NOT NULL THEN
          RAISE EXCEPTION 'site finding subject is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      ELSIF NEW.subject_type = 'page' THEN
        IF NEW.page_id IS NULL OR NEW.subject_id IS DISTINCT FROM NEW.page_id THEN
          RAISE EXCEPTION 'page finding subject is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      ELSE
        PERFORM web.assert_component_site(
          'web.snapshot'::regclass,
          NEW.subject_id,
          NEW.site_id,
          'finding snapshot subject'
        );
        SELECT page_id INTO pointer_page_id
          FROM web.snapshot WHERE id = NEW.subject_id;
        IF NEW.page_id IS DISTINCT FROM pointer_page_id THEN
          RAISE EXCEPTION 'snapshot finding page is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      END IF;

      SELECT key, category, subcategory
        INTO pointer_item_key, pointer_category, pointer_subcategory
        FROM web.analysis_item WHERE id = NEW.item_id;
      IF NOT FOUND
         OR NEW.item_key IS DISTINCT FROM pointer_item_key
         OR NEW.category IS DISTINCT FROM pointer_category
         OR NEW.subcategory IS DISTINCT FROM pointer_subcategory THEN
        RAISE EXCEPTION 'finding item denormalization does not match analysis_item'
          USING ERRCODE = '23514';
      END IF;

      IF NEW.first_result_id IS NOT NULL THEN
        SELECT site_id, subject_type, subject_id, item_id
          INTO pointer_session_id, pointer_subject_type, pointer_subject_id, pointer_item_id
          FROM web.analysis_result WHERE id = NEW.first_result_id;
        IF NOT FOUND
           OR pointer_session_id IS DISTINCT FROM NEW.site_id
           OR pointer_subject_type IS DISTINCT FROM NEW.subject_type
           OR pointer_subject_id IS DISTINCT FROM NEW.subject_id
           OR pointer_item_id IS DISTINCT FROM NEW.item_id THEN
          RAISE EXCEPTION 'finding first_result_id is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      END IF;

      IF NEW.last_result_id IS NOT NULL THEN
        SELECT site_id, subject_type, subject_id, item_id
          INTO pointer_session_id, pointer_subject_type, pointer_subject_id, pointer_item_id
          FROM web.analysis_result WHERE id = NEW.last_result_id;
        IF NOT FOUND
           OR pointer_session_id IS DISTINCT FROM NEW.site_id
           OR pointer_subject_type IS DISTINCT FROM NEW.subject_type
           OR pointer_subject_id IS DISTINCT FROM NEW.subject_id
           OR pointer_item_id IS DISTINCT FROM NEW.item_id THEN
          RAISE EXCEPTION 'finding last_result_id is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'link_edge' THEN
      PERFORM web.assert_component_site(
        'web.snapshot'::regclass,
        NEW.snapshot_id,
        NEW.site_id,
        'link snapshot'
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass,
        NEW.source_page_id,
        NEW.site_id,
        'link source page'
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass,
        NEW.target_page_id,
        NEW.site_id,
        'link target page'
      );
      SELECT page_id INTO pointer_page_id
        FROM web.snapshot WHERE id = NEW.snapshot_id;
      IF pointer_page_id IS DISTINCT FROM NEW.source_page_id THEN
        RAISE EXCEPTION 'link source page must match its snapshot page'
          USING ERRCODE = '23514';
      END IF;

    WHEN 'batch_item' THEN
      PERFORM web.assert_component_site(
        'web.batch_job'::regclass, NEW.batch_id, NEW.site_id, 'batch item job'
      );
      IF NEW.result_id IS NOT NULL THEN
        SELECT site_id, batch_id, item_id, provider_id, subject_type, subject_id
          INTO pointer_session_id, pointer_batch_id, pointer_item_id,
               pointer_provider_id, pointer_subject_type, pointer_subject_id
          FROM web.analysis_result WHERE id = NEW.result_id;
        IF NOT FOUND
           OR pointer_session_id IS DISTINCT FROM NEW.site_id
           OR pointer_batch_id IS DISTINCT FROM NEW.batch_id
           OR pointer_item_id IS DISTINCT FROM NEW.item_id
           OR pointer_provider_id IS DISTINCT FROM NEW.provider_id
           OR pointer_subject_type IS DISTINCT FROM NEW.subject_type
           OR pointer_subject_id IS DISTINCT FROM NEW.subject_id THEN
          RAISE EXCEPTION 'batch item result is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'crawl_url' THEN
      PERFORM web.assert_component_site(
        'web.crawl_session'::regclass,
        NEW.session_id,
        NEW.site_id,
        'crawl URL session'
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass,
        NEW.discovered_from_page_id,
        NEW.site_id,
        'crawl URL discovery page'
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass, NEW.page_id, NEW.site_id, 'crawl URL page'
      );
      PERFORM web.assert_component_site(
        'web.snapshot'::regclass,
        NEW.snapshot_id,
        NEW.site_id,
        'crawl URL snapshot'
      );
      IF NEW.snapshot_id IS NOT NULL THEN
        SELECT page_id INTO pointer_page_id
          FROM web.snapshot WHERE id = NEW.snapshot_id;
        IF NEW.page_id IS DISTINCT FROM pointer_page_id THEN
          RAISE EXCEPTION 'crawl URL page must match its snapshot page'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'crawl_event' THEN
      PERFORM web.assert_component_site(
        'web.crawl_session'::regclass,
        NEW.session_id,
        NEW.site_id,
        'crawl event session'
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass, NEW.page_id, NEW.site_id, 'crawl event page'
      );
      IF NEW.crawl_url_id IS NOT NULL THEN
        SELECT site_id, session_id
          INTO pointer_session_id, pointer_subject_id
          FROM web.crawl_url WHERE id = NEW.crawl_url_id;
        IF NOT FOUND
           OR pointer_session_id IS DISTINCT FROM NEW.site_id
           OR pointer_subject_id IS DISTINCT FROM NEW.session_id THEN
          RAISE EXCEPTION 'crawl event URL belongs to another site/session'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'page_evidence' THEN
      PERFORM web.assert_component_site(
        'web.page'::regclass,
        NEW.page_id,
        NEW.site_id,
        'page evidence page'
      );

    WHEN 'crawl_schedule' THEN
      PERFORM web.assert_component_site(
        'web.crawl_session'::regclass,
        NEW.last_session_id,
        NEW.site_id,
        'schedule last session'
      );

    ELSE
      RAISE EXCEPTION 'web.validate_cross_pointers is not configured for web.%',
        TG_TABLE_NAME USING ERRCODE = '55000';
  END CASE;

  RETURN NEW;
END;
$function$;

DO $attach_pointer_validation$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'site',
    'page',
    'snapshot',
    'screenshot',
    'analysis_result',
    'finding',
    'link_edge',
    'batch_item',
    'crawl_url',
    'crawl_event',
    'page_evidence',
    'crawl_schedule'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER _validate_cross_pointers
         BEFORE INSERT OR UPDATE ON web.%I
         FOR EACH ROW EXECUTE FUNCTION web.validate_cross_pointers()',
      table_name
    );
  END LOOP;
END;
$attach_pointer_validation$;

-- ---------------------------------------------------------------------------
-- 3. Immutable evidence and controlled batch-item lifecycle
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION web.reject_immutable_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'web.% is immutable; append a new row instead', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER _reject_immutable_fact_mutation
  BEFORE UPDATE OR DELETE ON web.snapshot
  FOR EACH ROW EXECUTE FUNCTION web.reject_immutable_fact_mutation();
CREATE TRIGGER _reject_immutable_fact_mutation
  BEFORE UPDATE OR DELETE ON web.analysis_result
  FOR EACH ROW EXECUTE FUNCTION web.reject_immutable_fact_mutation();
CREATE TRIGGER _reject_immutable_fact_mutation
  BEFORE UPDATE OR DELETE ON web.link_edge
  FOR EACH ROW EXECUTE FUNCTION web.reject_immutable_fact_mutation();

CREATE OR REPLACE FUNCTION web.enforce_batch_item_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.site_id IS DISTINCT FROM OLD.site_id
     OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
     OR NEW.item_id IS DISTINCT FROM OLD.item_id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
     OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'batch item input identity is immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       (OLD.status = 'queued' AND NEW.status IN ('submitted', 'processing', 'failed', 'cancelled'))
       OR (OLD.status = 'submitted' AND NEW.status IN ('processing', 'failed', 'cancelled'))
       OR (OLD.status = 'processing' AND NEW.status IN ('complete', 'failed', 'cancelled'))
     ) THEN
    RAISE EXCEPTION 'invalid batch item transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER _enforce_batch_item_lifecycle
  BEFORE UPDATE ON web.batch_item
  FOR EACH ROW EXECUTE FUNCTION web.enforce_batch_item_lifecycle();

REVOKE EXECUTE ON FUNCTION web.assert_component_site(regclass, uuid, uuid, text)
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION web.validate_cross_pointers()
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION web.reject_immutable_fact_mutation()
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION web.enforce_batch_item_lifecycle()
FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  pointer_trigger_count integer;
BEGIN
  SELECT count(*) INTO pointer_trigger_count
    FROM pg_trigger AS trigger
    JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
   WHERE namespace.nspname = 'web'
     AND trigger.tgname = '_validate_cross_pointers'
     AND NOT trigger.tgisinternal;

  IF pointer_trigger_count <> 12 THEN
    RAISE EXCEPTION 'Expected 12 cross-pointer triggers, found %',
      pointer_trigger_count;
  END IF;

  IF (
    SELECT indexdef NOT LIKE '%subject_type%'
      FROM pg_indexes
     WHERE schemaname = 'web' AND indexname = 'finding_open_uniq'
  ) THEN
    RAISE EXCEPTION 'finding_open_uniq is missing subject_type';
  END IF;
END;
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
