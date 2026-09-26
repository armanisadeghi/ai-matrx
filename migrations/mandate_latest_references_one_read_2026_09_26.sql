-- mandate_latest_references_one_read_2026_09_26.sql
--
-- ONE read of the latest code-scan references, filtered in the database.
--
-- WHY (2026-09-26 outage on /administration/intelligence/mandates): the browser read
-- `mandate.v_reference_latest` through readAllRows in 1,000-row pages with count=exact —
-- up to 13 round trips for the whole fleet, 5 for Mandate health's 4,203 findings — and
-- every page re-evaluated the view from scratch. aidream migration 1167 made one evaluation
-- cheap (~0.2 s warm); this makes each consumer ONE evaluation: the filters the client used
-- to put on the PostgREST query run here, and the rows come back as one JSON array (no
-- max-rows paging, no count query).
--
-- SECURITY INVOKER: it reads the view as the caller, so `mandate.reference` RLS decides
-- every row exactly as the direct read did. Filter semantics mirror the old PostgREST query
-- exactly (NULL reference_type_id / flag / presence fall out of `in`, `not in` and `neq`).
--
-- Consumers: features/mandates/code-references/data.ts `readLatestReferences` (Unconverted
-- AI calls, Mandate health, the admin list's Declared-in / Called-from columns).
-- ADDITIVE: one new function.


CREATE OR REPLACE FUNCTION mandate.latest_references(
  p_type_ids uuid[] DEFAULT NULL,
  p_exclude_type_ids uuid[] DEFAULT NULL,
  p_problems_only boolean DEFAULT false,
  p_keys text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'identity_hash', l.identity_hash,
           'mandate_key', l.mandate_key,
           'reference_type_id', l.reference_type_id,
           'repo_slug', l.repo_slug,
           'package_name', l.package_name,
           'language', l.language,
           'file_path', l.file_path,
           'symbol', l.symbol,
           'line', l.line,
           'revision', l.revision,
           'revision_kind', l.revision_kind,
           'presence', l.presence,
           'flag', l.flag)
         ORDER BY l.identity_hash), '[]'::jsonb)
    FROM mandate.v_reference_latest l
   WHERE (p_type_ids IS NULL OR l.reference_type_id = ANY (p_type_ids))
     AND (p_exclude_type_ids IS NULL OR NOT (l.reference_type_id = ANY (p_exclude_type_ids)))
     AND (NOT coalesce(p_problems_only, false) OR l.flag <> 'ok' OR l.presence <> 'present')
     AND (p_keys IS NULL OR l.mandate_key = ANY (p_keys))
$$;

COMMENT ON FUNCTION mandate.latest_references(uuid[], uuid[], boolean, text[]) IS
  'The latest code-scan reference per identity (mandate.v_reference_latest), filtered in the database and returned as ONE JSON array ordered by identity_hash: p_type_ids / p_exclude_type_ids (platform.categories ids, dimension mandate_reference_type), p_problems_only (flag <> ok OR presence <> present), p_keys (mandate keys). SECURITY INVOKER — mandate.reference RLS decides every row. 2026-09-26.';

DO $proof$
BEGIN
  IF (SELECT p.prosecdef FROM pg_proc p
       WHERE p.oid = 'mandate.latest_references(uuid[], uuid[], boolean, text[])'::regprocedure) THEN
    RAISE EXCEPTION 'mandate.latest_references must be SECURITY INVOKER';
  END IF;
  IF NOT has_function_privilege('authenticated', 'mandate.latest_references(uuid[], uuid[], boolean, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute mandate.latest_references';
  END IF;
END
$proof$;

