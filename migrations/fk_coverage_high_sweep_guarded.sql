-- fk_coverage_high_sweep_guarded
-- Duplicate-safe sweep of the iam.fk_coverage_gaps HIGH set (non-graveyard), run
-- after concurrent base-retrofit churn refilled the report with ~108 new HIGH gaps
-- (agent_run, applet, transcripts, custom_app_configs, iam.org_member_controls,
-- iam.org_admin_audit, user_* tables, etc. — all the standard created_by/updated_by/
-- user_id -> auth.users and organization_id -> public.organizations pattern).
--
-- 1. Drops the redundant skill.project.project_id FK an earlier pass added
--    (a concurrent agent had already created skl_skill_projects_project_id_fkey on
--    the same column — the original guard only checked its own constraint name).
-- 2. Adds each remaining HIGH FK ONLY when no single-column FK already exists on the
--    column (name-independent guard — prevents duplicating concurrent retrofit FKs).
--    public.auto_ingest_cost_event.created_by had 2 legacy orphans -> NOT VALID;
--    everything else is orphan-free -> validated.
-- Idempotent + re-runnable (does nothing once columns are covered).
DO $f$
DECLARE r record; has_fk boolean; ddl text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='project_project_id_fkey' AND connamespace='skill'::regnamespace) THEN
    ALTER TABLE skill.project DROP CONSTRAINT project_project_id_fkey;
  END IF;

  FOR r IN
    SELECT schema_name, table_name, column_name, suggested_ddl
    FROM iam.fk_coverage_gaps
    WHERE confidence='HIGH' AND schema_name<>'graveyard' AND target_resolves
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
      WHERE c.contype='f'
        AND c.conrelid = format('%I.%I', r.schema_name, r.table_name)::regclass
        AND array_length(c.conkey,1)=1
        AND a.attname = r.column_name
    ) INTO has_fk;
    IF has_fk THEN CONTINUE; END IF;

    ddl := r.suggested_ddl;
    IF r.schema_name='public' AND r.table_name='auto_ingest_cost_event' AND r.column_name='created_by' THEN
      ddl := replace(ddl, ';', ' NOT VALID;');
    END IF;
    EXECUTE ddl;
  END LOOP;
END $f$;
