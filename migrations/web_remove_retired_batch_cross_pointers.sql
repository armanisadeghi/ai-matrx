-- web.batch_job and web.batch_item were retired after their execution role moved
-- to batch.*. Keep the shared cross-pointer trigger aligned with the relations
-- that still exist: analysis_result rows belong to a page/session/catalog item,
-- but no longer belong to a web.batch_job.
--
-- This migration patches the live function definition instead of restating the
-- entire multi-table trigger. That keeps unrelated validation branches exactly
-- as deployed and makes the repair safe to re-run.
DO $repair_retired_web_batch_cross_pointers$
DECLARE
  function_sql text;
  result_batch_block constant text := $block$
      PERFORM web.assert_component_site(
        'web.batch_job'::regclass, NEW.batch_id, NEW.site_id, 'result batch'
      );

$block$;
  batch_item_block constant text := $block$
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

$block$;
BEGIN
  SELECT pg_get_functiondef('web.validate_cross_pointers()'::regprocedure)
    INTO function_sql;

  function_sql := replace(function_sql, result_batch_block, '');
  function_sql := replace(function_sql, batch_item_block, '');

  IF function_sql ILIKE '%web.batch_job%'
     OR function_sql LIKE '%WHEN ''batch_item'' THEN%' THEN
    RAISE EXCEPTION
      'web.validate_cross_pointers still references the retired web batch spine'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE function_sql;
END;
$repair_retired_web_batch_cross_pointers$;
