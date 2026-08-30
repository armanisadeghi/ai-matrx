-- Let focused consumers (notably one study kit) request the canonical library
-- facts for an exact set of artifacts. Without this predicate a kit has to scan
-- the learner's entire library just to recover progress for its eight members.
--
-- Signature and return shape stay unchanged. The patch is deliberately made
-- against the installed function definition because the live function has
-- accumulated additive result columns since its original baseline migration;
-- recreating an older body here would silently delete those KPI columns.

DO $migration$
DECLARE
  v_proc regprocedure := to_regprocedure(
    'public.edu_library_list_scoped(text,text,text,text,jsonb,integer,integer)'
  );
  v_definition text;
  v_anchor text := $anchor$      AND (NOT v_filters ? 'title'
           OR r.title ILIKE '%' || (v_filters->'title'->>'value') || '%')$anchor$;
  v_replacement text := $replacement$      AND (NOT v_filters ? 'id'
           OR r.id::text IN (
             SELECT jsonb_array_elements_text(v_filters->'id'->'values')
           ))
      AND (NOT v_filters ? 'title'
           OR r.title ILIKE '%' || (v_filters->'title'->>'value') || '%')$replacement$;
BEGIN
  IF v_proc IS NULL THEN
    RAISE EXCEPTION
      'education_library_exact_id_filter: edu_library_list_scoped is missing';
  END IF;

  v_definition := pg_get_functiondef(v_proc);

  -- Safe to replay after the filter has already landed.
  IF position('NOT v_filters ? ''id''' IN v_definition) > 0 THEN
    RETURN;
  END IF;

  IF position(v_anchor IN v_definition) = 0 THEN
    RAISE EXCEPTION
      'education_library_exact_id_filter: expected filter anchor was not found';
  END IF;

  EXECUTE replace(v_definition, v_anchor, v_replacement);
END;
$migration$;

COMMENT ON FUNCTION public.edu_library_list_scoped(
  text, text, text, text, jsonb, integer, integer
) IS
  'Access-scoped Education Library list with search, exact id, column filters, sorting, paging, and per-artifact study-spine facts.';
