-- target: branch
-- chair-step: THE INVERSE of `datacreatefix_the_rehearsal_copy_stops_filling_a_column_nothing_fills.sql`,
--   as far as the platform permits one. It re-attaches `_deprecated_write_guard` on
--   `workbench.schema_templates` on the rehearsal branch, which turns the fourth clause of
--   `check:branch-schema-drift` RED again by one finding — which is how that clause is shown
--   failing before it is shown passing.
--
-- 🚨 THE OTHER NINE CANNOT COME BACK, AND THAT IS THE PLATFORM BEING RIGHT.
-- The first draft of this file re-attached all ten. The branch's own DDL guard refused it,
-- verbatim, 2026-09-21:
--
--   SQLSTATE 23514
--   ddl_guard: _stamp_org_default on workbench.udt_datasets creates or clones an
--   organization-assignment trigger function
--   HINT: Writers must supply organization_id explicitly. A validation-only trigger may
--   refuse a missing value, but no trigger/function may assign one.
--
-- So the nine organization stampers are one-way: `platform._ddl_guard` will not let ANY
-- migration, on either database, put an organization-assigning trigger back. That is
-- exactly the ruling this lane's forward fix obeys, and it means the levelling of those
-- nine is irreversible by design rather than by omission. Recording the refusal here is
-- the honest form of "the inverse does not exist"; inventing a reversal that the platform
-- would reject at apply time would be a file that has never run and never could.
--
-- NO ROW IS TOUCHED in either direction.

CREATE TRIGGER _deprecated_write_guard BEFORE INSERT OR DELETE OR UPDATE ON workbench.schema_templates
  FOR EACH ROW EXECUTE FUNCTION platform._deprecated_write_guard();

DO $inv$
DECLARE v_back int;
BEGIN
  SELECT count(*) INTO v_back
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal
     AND n.nspname = 'workbench'
     AND t.tgname = '_deprecated_write_guard';
  IF v_back <> 1 THEN
    RAISE EXCEPTION 'ABORT: reversal re-attached % of 1 permitted workbench trigger(s).', v_back;
  END IF;
  RAISE NOTICE 'DATA-CREATE-FIX inverse: the one reversible workbench attachment is back; check:branch-schema-drift should now report 1 live-route finding.';
END $inv$;
