-- A learner sees the source/kit title on every Education Library card. Search
-- must use that same label, or generated artifacts whose own titles differ
-- disappear from the kit search that is supposed to gather them.
--
-- Preserve the installed function's additive result columns. The live RPC has
-- page-bounded study facts that are newer than the baseline migration, so this
-- patch changes only the search CTE and generic scorer inputs.

SET lock_timeout = '8s';
SET statement_timeout = '30s';

DO $migration$
DECLARE
  v_proc regprocedure := to_regprocedure(
    'public.edu_library_list_scoped(text,text,text,text,jsonb,integer,integer)'
  );
  v_definition text;
  v_searchable_anchor text := $anchor$  WITH filtered AS (
    SELECT r.*
    FROM public.edu_library_scope_rows(p_scope) r
    WHERE ($anchor$;
  v_searchable_replacement text := $replacement$  WITH searchable AS (
    SELECT
      r.*,
      coalesce(asm_search.source_title, sm_search.source_title) AS search_source_title
    FROM public.edu_library_scope_rows(p_scope) r
    LEFT JOIN education.assessment asm_search
      ON v_search IS NOT NULL
     AND r.kind = 'assessment'
     AND asm_search.id = r.id
    LEFT JOIN education.study_media sm_search
      ON v_search IS NOT NULL
     AND r.kind = 'study_media'
     AND sm_search.id = r.id
  ),
  filtered AS (
    SELECT r.*
    FROM searchable r
    WHERE ($replacement$;
  v_filter_anchor text := $anchor$      OR r.subtype ILIKE '%' || v_search || '%'
      OR coalesce(r.owner_email, '') ILIKE '%' || v_search || '%'$anchor$;
  v_filter_replacement text := $replacement$      OR r.subtype ILIKE '%' || v_search || '%'
      OR coalesce(r.search_source_title, '') ILIKE '%' || v_search || '%'
      OR coalesce(r.owner_email, '') ILIKE '%' || v_search || '%'$replacement$;
  v_score_anchor text := $anchor$          ARRAY[f.kind, f.subtype, f.status],$anchor$;
  v_score_replacement text := $replacement$          ARRAY[f.kind, f.subtype, f.status, coalesce(f.search_source_title, '')],$replacement$;
BEGIN
  IF v_proc IS NULL THEN
    RAISE EXCEPTION
      'education_library_search_source_title: edu_library_list_scoped is missing';
  END IF;

  v_definition := pg_get_functiondef(v_proc);

  IF position(
       'coalesce(asm_search.source_title, sm_search.source_title) AS search_source_title'
       IN v_definition
     ) > 0
     AND position(
       'coalesce(r.search_source_title, '''') ILIKE ''%'' || v_search || ''%'''
       IN v_definition
     ) > 0
     AND position(
       'ARRAY[f.kind, f.subtype, f.status, coalesce(f.search_source_title, '''')]'
       IN v_definition
     ) > 0 THEN
    RETURN;
  END IF;

  IF position('search_source_title' IN v_definition) > 0 THEN
    RAISE EXCEPTION
      'education_library_search_source_title: partial prior patch detected';
  END IF;

  IF position(v_searchable_anchor IN v_definition) = 0
     OR position(v_filter_anchor IN v_definition) = 0
     OR position(v_score_anchor IN v_definition) = 0 THEN
    RAISE EXCEPTION
      'education_library_search_source_title: expected function anchors were not found';
  END IF;

  v_definition := replace(
    v_definition,
    v_searchable_anchor,
    v_searchable_replacement
  );
  v_definition := replace(v_definition, v_filter_anchor, v_filter_replacement);
  v_definition := replace(v_definition, v_score_anchor, v_score_replacement);
  EXECUTE v_definition;

  v_definition := pg_get_functiondef(v_proc);
  IF position(
       'coalesce(asm_search.source_title, sm_search.source_title) AS search_source_title'
       IN v_definition
     ) = 0
     OR position(
       'coalesce(r.search_source_title, '''') ILIKE ''%'' || v_search || ''%'''
       IN v_definition
     ) = 0
     OR position(
       'ARRAY[f.kind, f.subtype, f.status, coalesce(f.search_source_title, '''')]'
       IN v_definition
     ) = 0 THEN
    RAISE EXCEPTION
      'education_library_search_source_title: installed function did not retain the complete patch';
  END IF;
END;
$migration$;

COMMENT ON FUNCTION public.edu_library_list_scoped(
  text, text, text, text, jsonb, integer, integer
) IS
  'Access-scoped Education Library list with visible source-title search, exact id and column filters, sorting, paging, and per-artifact study-spine facts.';
