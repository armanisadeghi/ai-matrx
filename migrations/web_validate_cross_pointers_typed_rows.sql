-- Keep the shared Marketing cross-pointer trigger statically checkable.
--
-- `web.validate_cross_pointers()` is attached to eleven tables. plpgsql_check
-- validates a trigger function against one attached relation, so raw
-- table-specific `NEW.<column>` references in the other CASE branches look
-- broken even though PostgreSQL only executes the matching branch at runtime.
-- Bind each branch to its actual composite row type before dereferencing it.
-- This removes the false 42703 audit failures without weakening any invariant,
-- and a future column rename remains a loud compile-time failure.

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
  pointer_kind text;
  pointer_http_status integer;

  site_row web.site%ROWTYPE;
  page_row web.page%ROWTYPE;
  snapshot_row web.snapshot%ROWTYPE;
  screenshot_row web.screenshot%ROWTYPE;
  analysis_result_row web.analysis_result%ROWTYPE;
  finding_row web.finding%ROWTYPE;
  link_edge_row web.link_edge%ROWTYPE;
  crawl_url_row web.crawl_url%ROWTYPE;
  crawl_event_row web.crawl_event%ROWTYPE;
  page_evidence_row web.page_evidence%ROWTYPE;
  crawl_schedule_row web.crawl_schedule%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
     AND (pg_catalog.to_jsonb(OLD) - ARRAY['deleted_at', 'updated_at', 'updated_by', 'version'])
         = (pg_catalog.to_jsonb(NEW) - ARRAY['deleted_at', 'updated_at', 'updated_by', 'version']) THEN
    RETURN NEW;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'site' THEN
      site_row := pg_catalog.jsonb_populate_record(
        NULL::web.site,
        pg_catalog.to_jsonb(NEW)
      );
      IF site_row.homepage_screenshot_id IS NOT NULL THEN
        PERFORM web.assert_component_site(
          'web.screenshot'::regclass,
          site_row.homepage_screenshot_id,
          site_row.id,
          'homepage screenshot'
        );
        SELECT kind INTO pointer_kind
          FROM web.screenshot WHERE id = site_row.homepage_screenshot_id;
        IF pointer_kind <> 'homepage' THEN
          RAISE EXCEPTION 'site homepage_screenshot_id must point to kind=homepage'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'page' THEN
      page_row := pg_catalog.jsonb_populate_record(
        NULL::web.page,
        pg_catalog.to_jsonb(NEW)
      );
      IF page_row.latest_snapshot_id IS NOT NULL THEN
        PERFORM web.assert_component_site(
          'web.snapshot'::regclass,
          page_row.latest_snapshot_id,
          page_row.site_id,
          'latest snapshot'
        );
        SELECT page_id, http_status
          INTO pointer_page_id, pointer_http_status
          FROM web.snapshot WHERE id = page_row.latest_snapshot_id;
        IF pointer_page_id IS DISTINCT FROM page_row.id
           OR pointer_http_status IS NULL
           OR pointer_http_status NOT BETWEEN 200 AND 399 THEN
          RAISE EXCEPTION 'latest snapshot must be a successful capture of this page'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'snapshot' THEN
      snapshot_row := pg_catalog.jsonb_populate_record(
        NULL::web.snapshot,
        pg_catalog.to_jsonb(NEW)
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass,
        snapshot_row.page_id,
        snapshot_row.site_id,
        'snapshot page'
      );
      PERFORM web.assert_component_site(
        'web.crawl_session'::regclass,
        snapshot_row.session_id,
        snapshot_row.site_id,
        'snapshot crawl session'
      );

    WHEN 'screenshot' THEN
      screenshot_row := pg_catalog.jsonb_populate_record(
        NULL::web.screenshot,
        pg_catalog.to_jsonb(NEW)
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass,
        screenshot_row.page_id,
        screenshot_row.site_id,
        'screenshot page'
      );
      PERFORM web.assert_component_site(
        'web.snapshot'::regclass,
        screenshot_row.snapshot_id,
        screenshot_row.site_id,
        'screenshot snapshot'
      );
      IF screenshot_row.snapshot_id IS NOT NULL THEN
        SELECT page_id INTO pointer_page_id
          FROM web.snapshot WHERE id = screenshot_row.snapshot_id;
        IF screenshot_row.page_id IS DISTINCT FROM pointer_page_id THEN
          RAISE EXCEPTION 'screenshot page must match its snapshot page'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'analysis_result' THEN
      analysis_result_row := pg_catalog.jsonb_populate_record(
        NULL::web.analysis_result,
        pg_catalog.to_jsonb(NEW)
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass,
        analysis_result_row.page_id,
        analysis_result_row.site_id,
        'result page'
      );
      PERFORM web.assert_component_site(
        'web.crawl_session'::regclass,
        analysis_result_row.run_id,
        analysis_result_row.site_id,
        'result crawl session'
      );

      SELECT key, category, subcategory
        INTO pointer_item_key, pointer_category, pointer_subcategory
        FROM web.analysis_item WHERE id = analysis_result_row.item_id;
      IF NOT FOUND
         OR analysis_result_row.item_key IS DISTINCT FROM pointer_item_key
         OR analysis_result_row.category IS DISTINCT FROM pointer_category
         OR analysis_result_row.subcategory IS DISTINCT FROM pointer_subcategory THEN
        RAISE EXCEPTION 'result item denormalization does not match analysis_item'
          USING ERRCODE = '23514';
      END IF;

      IF analysis_result_row.subject_type = 'site' THEN
        IF analysis_result_row.subject_id IS DISTINCT FROM analysis_result_row.site_id
           OR analysis_result_row.page_id IS NOT NULL THEN
          RAISE EXCEPTION 'site result subject is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      ELSIF analysis_result_row.subject_type = 'page' THEN
        IF analysis_result_row.page_id IS NULL
           OR analysis_result_row.subject_id IS DISTINCT FROM analysis_result_row.page_id THEN
          RAISE EXCEPTION 'page result subject is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      ELSE
        PERFORM web.assert_component_site(
          'web.snapshot'::regclass,
          analysis_result_row.subject_id,
          analysis_result_row.site_id,
          'result snapshot subject'
        );
        SELECT page_id INTO pointer_page_id
          FROM web.snapshot WHERE id = analysis_result_row.subject_id;
        IF analysis_result_row.page_id IS DISTINCT FROM pointer_page_id THEN
          RAISE EXCEPTION 'snapshot result page is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'finding' THEN
      finding_row := pg_catalog.jsonb_populate_record(
        NULL::web.finding,
        pg_catalog.to_jsonb(NEW)
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass,
        finding_row.page_id,
        finding_row.site_id,
        'finding page'
      );

      IF finding_row.subject_type = 'site' THEN
        IF finding_row.subject_id IS DISTINCT FROM finding_row.site_id
           OR finding_row.page_id IS NOT NULL THEN
          RAISE EXCEPTION 'site finding subject is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      ELSIF finding_row.subject_type = 'page' THEN
        IF finding_row.page_id IS NULL
           OR finding_row.subject_id IS DISTINCT FROM finding_row.page_id THEN
          RAISE EXCEPTION 'page finding subject is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      ELSE
        PERFORM web.assert_component_site(
          'web.snapshot'::regclass,
          finding_row.subject_id,
          finding_row.site_id,
          'finding snapshot subject'
        );
        SELECT page_id INTO pointer_page_id
          FROM web.snapshot WHERE id = finding_row.subject_id;
        IF finding_row.page_id IS DISTINCT FROM pointer_page_id THEN
          RAISE EXCEPTION 'snapshot finding page is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      END IF;

      SELECT key, category, subcategory
        INTO pointer_item_key, pointer_category, pointer_subcategory
        FROM web.analysis_item WHERE id = finding_row.item_id;
      IF NOT FOUND
         OR finding_row.item_key IS DISTINCT FROM pointer_item_key
         OR finding_row.category IS DISTINCT FROM pointer_category
         OR finding_row.subcategory IS DISTINCT FROM pointer_subcategory THEN
        RAISE EXCEPTION 'finding item denormalization does not match analysis_item'
          USING ERRCODE = '23514';
      END IF;

      IF finding_row.first_result_id IS NOT NULL THEN
        SELECT site_id, subject_type, subject_id, item_id
          INTO pointer_session_id, pointer_subject_type, pointer_subject_id, pointer_item_id
          FROM web.analysis_result WHERE id = finding_row.first_result_id;
        IF NOT FOUND
           OR pointer_session_id IS DISTINCT FROM finding_row.site_id
           OR pointer_subject_type IS DISTINCT FROM finding_row.subject_type
           OR pointer_subject_id IS DISTINCT FROM finding_row.subject_id
           OR pointer_item_id IS DISTINCT FROM finding_row.item_id THEN
          RAISE EXCEPTION 'finding first_result_id is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      END IF;

      IF finding_row.last_result_id IS NOT NULL THEN
        SELECT site_id, subject_type, subject_id, item_id
          INTO pointer_session_id, pointer_subject_type, pointer_subject_id, pointer_item_id
          FROM web.analysis_result WHERE id = finding_row.last_result_id;
        IF NOT FOUND
           OR pointer_session_id IS DISTINCT FROM finding_row.site_id
           OR pointer_subject_type IS DISTINCT FROM finding_row.subject_type
           OR pointer_subject_id IS DISTINCT FROM finding_row.subject_id
           OR pointer_item_id IS DISTINCT FROM finding_row.item_id THEN
          RAISE EXCEPTION 'finding last_result_id is inconsistent'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'link_edge' THEN
      link_edge_row := pg_catalog.jsonb_populate_record(
        NULL::web.link_edge,
        pg_catalog.to_jsonb(NEW)
      );
      PERFORM web.assert_component_site(
        'web.snapshot'::regclass,
        link_edge_row.snapshot_id,
        link_edge_row.site_id,
        'link snapshot'
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass,
        link_edge_row.source_page_id,
        link_edge_row.site_id,
        'link source page'
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass,
        link_edge_row.target_page_id,
        link_edge_row.site_id,
        'link target page'
      );
      SELECT page_id INTO pointer_page_id
        FROM web.snapshot WHERE id = link_edge_row.snapshot_id;
      IF pointer_page_id IS DISTINCT FROM link_edge_row.source_page_id THEN
        RAISE EXCEPTION 'link source page must match its snapshot page'
          USING ERRCODE = '23514';
      END IF;

    WHEN 'crawl_url' THEN
      crawl_url_row := pg_catalog.jsonb_populate_record(
        NULL::web.crawl_url,
        pg_catalog.to_jsonb(NEW)
      );
      PERFORM web.assert_component_site(
        'web.crawl_session'::regclass,
        crawl_url_row.session_id,
        crawl_url_row.site_id,
        'crawl URL session'
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass,
        crawl_url_row.discovered_from_page_id,
        crawl_url_row.site_id,
        'crawl URL discovery page'
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass,
        crawl_url_row.page_id,
        crawl_url_row.site_id,
        'crawl URL page'
      );
      PERFORM web.assert_component_site(
        'web.snapshot'::regclass,
        crawl_url_row.snapshot_id,
        crawl_url_row.site_id,
        'crawl URL snapshot'
      );
      IF crawl_url_row.snapshot_id IS NOT NULL THEN
        SELECT page_id INTO pointer_page_id
          FROM web.snapshot WHERE id = crawl_url_row.snapshot_id;
        IF crawl_url_row.page_id IS DISTINCT FROM pointer_page_id THEN
          RAISE EXCEPTION 'crawl URL page must match its snapshot page'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'crawl_event' THEN
      crawl_event_row := pg_catalog.jsonb_populate_record(
        NULL::web.crawl_event,
        pg_catalog.to_jsonb(NEW)
      );
      PERFORM web.assert_component_site(
        'web.crawl_session'::regclass,
        crawl_event_row.session_id,
        crawl_event_row.site_id,
        'crawl event session'
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass,
        crawl_event_row.page_id,
        crawl_event_row.site_id,
        'crawl event page'
      );
      IF crawl_event_row.crawl_url_id IS NOT NULL THEN
        SELECT site_id, session_id
          INTO pointer_session_id, pointer_subject_id
          FROM web.crawl_url WHERE id = crawl_event_row.crawl_url_id;
        IF NOT FOUND
           OR pointer_session_id IS DISTINCT FROM crawl_event_row.site_id
           OR pointer_subject_id IS DISTINCT FROM crawl_event_row.session_id THEN
          RAISE EXCEPTION 'crawl event URL belongs to another site/session'
            USING ERRCODE = '23514';
        END IF;
      END IF;

    WHEN 'page_evidence' THEN
      page_evidence_row := pg_catalog.jsonb_populate_record(
        NULL::web.page_evidence,
        pg_catalog.to_jsonb(NEW)
      );
      PERFORM web.assert_component_site(
        'web.page'::regclass,
        page_evidence_row.page_id,
        page_evidence_row.site_id,
        'page evidence page'
      );

    WHEN 'crawl_schedule' THEN
      crawl_schedule_row := pg_catalog.jsonb_populate_record(
        NULL::web.crawl_schedule,
        pg_catalog.to_jsonb(NEW)
      );
      PERFORM web.assert_component_site(
        'web.crawl_session'::regclass,
        crawl_schedule_row.last_session_id,
        crawl_schedule_row.site_id,
        'schedule last session'
      );

    ELSE
      RAISE EXCEPTION 'web.validate_cross_pointers is not configured for web.%',
        TG_TABLE_NAME USING ERRCODE = '55000';
  END CASE;

  RETURN NEW;
END;
$function$;

