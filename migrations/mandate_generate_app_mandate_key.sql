-- Phase 6.9 — the app -> mandate key generator. APPLIED LIVE via Supabase MCP;
-- this file is the record, not the mechanism.
--
-- Mirrors mandate.generate_shortcut_mandate_key: `app.<slug>`, disambiguated
-- first by the app's name and then by a numeric tail, so the live
-- definition_feature_owned_name_check can never reject a generated key and the
-- row-by-row migration loop sees every key it has already inserted.
--
-- It REUSES mandate.shortcut_slug (a pure slugger despite the legacy name --
-- one slugger, not two) and re-implements only the segment sanitiser, because
-- the collision suffix must read as an app (`_app`), not as a shortcut
-- (`_sc`). The forbidden-noun list and the `internal` rewrite are the same
-- rules the table's CHECK enforces.

CREATE OR REPLACE FUNCTION mandate.sanitize_app_segment(p_seg text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $function$
  SELECT CASE
    WHEN q.s ~ '(^|_)(agent|assistant|bot|model|worker|runner|handler|processor|manager|service|task|job|helper)$'
    THEN q.s || '_app'
    ELSE q.s
  END
  FROM (
    SELECT regexp_replace(coalesce(p_seg, ''), '(^|_)internal(_|$)', '\1intrnl\2', 'g') AS s
  ) q
$function$;

CREATE OR REPLACE FUNCTION mandate.generate_app_mandate_key(p_slug text, p_name text)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  base text := 'app.' || mandate.sanitize_app_segment(mandate.shortcut_slug(p_slug));
  candidate text;
  n int := 2;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM mandate.definition WHERE mandate_key = base AND deleted_at IS NULL) THEN
    RETURN base;
  END IF;
  IF p_name IS NOT NULL AND btrim(p_name) <> '' THEN
    candidate := base || '.' || mandate.sanitize_app_segment(mandate.shortcut_slug(p_name));
    IF NOT EXISTS (SELECT 1 FROM mandate.definition WHERE mandate_key = candidate AND deleted_at IS NULL) THEN
      RETURN candidate;
    END IF;
    base := candidate;
  END IF;
  LOOP
    candidate := base || '_' || n;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM mandate.definition WHERE mandate_key = candidate AND deleted_at IS NULL);
    n := n + 1;
  END LOOP;
  RETURN candidate;
END
$function$;
