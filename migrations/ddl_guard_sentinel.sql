-- Applied live 2026-08-12 (hardening pass task_b4bd08d8, Arman-ratified in-session).
-- G1 of operations/db-hardening-proposals.md: the DDL sentinel — closes doctrine §9's
-- known gap ("nothing blocks a hand-rolled non-canonical CREATE TABLE") plus four folded
-- candidates. ONE event trigger, two lanes:
--   ERROR lane (aborts DDL, never legitimate):
--     (a) column named `visibility` not of type platform.visibility (access-arch §2.4b;
--         the seo.competitor numeric-visibility incident)
--     (b) new project_id FK -> workspace.projects (forbidden relationship shortcut)
--     (c) re-creating any function named _mirror_fk_to_assoc (forbidden machinery)
--   WARN lane (RAISE WARNING + platform.ddl_guard_log row; exception-wrapped so a bug
--   here can NEVER abort anyone's DDL):
--     public-schema tables, kill-list columns, junction-shaped tables, org NOT NULL
--     without backstop, hand-rolled entity-looking tables.
-- Grandfather lists re-derived live at apply time (2026-08-12 ~23:55Z). Escape hatch:
-- ALTER EVENT TRIGGER ddl_guard DISABLE;

CREATE TABLE IF NOT EXISTS platform.ddl_guard_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL CHECK (severity IN ('warn','notice')),
  rule text NOT NULL,
  object_ref text,
  command_tag text,
  detail text NOT NULL,
  acknowledged_at timestamptz
);

CREATE OR REPLACE FUNCTION platform._ddl_guard()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cmd record;
  v_schema text; v_rel text; v_kind "char"; v_ispart boolean;
  -- grandfathered visibility-type offenders (live census at apply; fixes = owners' queue)
  c_vis_grandfather CONSTANT text[] := ARRAY[
    'files.uploads_inflight','public.heatmap_saves'];
  -- grandfathered project_id-FK tables (live census at apply, 17 tables)
  c_proj_grandfather CONSTANT text[] := ARRAY[
    'agent.shortcut','agent.template','public.app_instances','canvas.canvas_items',
    'chat.agent_plan','code.code_file_folders','code.code_files','code.code_repositories',
    'context.user_active_context','docproc.page_extraction_jobs','legal.wc_claim',
    'public.message_template','public.sandbox_instances','skill.definition',
    'skill.render_definition','workbench.udt_datasets','workspace.tasks'];
  c_exempt_schemas CONSTANT text[] := ARRAY[
    'graveyard','auth','storage','realtime','vault','extensions','supabase_functions',
    'supabase_migrations','cron','net','pgsodium','_analytics','_realtime'];
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF cmd.in_extension THEN CONTINUE; END IF;

    -- ERROR lane (c): the banned mirror machinery may never come back
    IF cmd.command_tag = 'CREATE FUNCTION'
       AND cmd.object_identity LIKE '%._mirror_fk_to_assoc(%' THEN
      RAISE EXCEPTION 'ddl_guard: creating % is FORBIDDEN', cmd.object_identity
        USING HINT = 'platform._mirror_fk_to_assoc creates two competing relationship authorities. Write canonical platform.associations edges via assoc_link instead. (matrx-frontend CLAUDE.md, Forbidden relationship shortcuts.)',
              ERRCODE = 'check_violation';
    END IF;

    IF cmd.command_tag NOT IN ('CREATE TABLE','ALTER TABLE') THEN CONTINUE; END IF;

    SELECT n.nspname, c.relname, c.relkind, c.relispartition
      INTO v_schema, v_rel, v_kind, v_ispart
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = cmd.objid;
    IF v_rel IS NULL OR v_kind NOT IN ('r','p') OR v_ispart
       OR v_schema LIKE 'pg\_%' OR v_schema = ANY (c_exempt_schemas) THEN
      CONTINUE;
    END IF;

    -- ERROR lane (a): the column name `visibility` is RESERVED (access-architecture §2.4b)
    IF v_schema||'.'||v_rel <> ALL (c_vis_grandfather) AND EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = cmd.objid AND a.attname = 'visibility'
        AND NOT a.attisdropped AND a.atttypid <> 'platform.visibility'::regtype
    ) THEN
      RAISE EXCEPTION 'ddl_guard: %.% has a column named "visibility" that is not type platform.visibility', v_schema, v_rel
        USING HINT = 'The name is RESERVED for access visibility — a name-colliding column breaks the org RLS lane (the seo.competitor numeric-index incident). Rename the domain metric (e.g. serp_visibility) or use the platform.visibility enum.',
              ERRCODE = 'check_violation';
    END IF;

    -- ERROR lane (b): new project-FK as feature ownership (forbidden relationship shortcut)
    IF v_schema||'.'||v_rel <> ALL (c_proj_grandfather) AND EXISTS (
      SELECT 1 FROM pg_constraint fk
      WHERE fk.conrelid = cmd.objid AND fk.contype = 'f'
        AND fk.confrelid = to_regclass('workspace.projects')
        AND EXISTS (SELECT 1 FROM unnest(fk.conkey) k
                    JOIN pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = k
                    WHERE a.attname = 'project_id')
    ) THEN
      RAISE EXCEPTION 'ddl_guard: %.% adds a project_id FK to workspace.projects', v_schema, v_rel
        USING HINT = 'A feature table may not depend on a project FK for ownership/lifecycle/authorization. Project membership is an optional platform.associations edge between entity tokens (assoc_link); the feature must work with no project at all. (matrx-frontend CLAUDE.md, Forbidden relationship shortcuts.)',
              ERRCODE = 'check_violation';
    END IF;

    -- WARN lane — may NEVER abort DDL
    BEGIN
      IF cmd.command_tag = 'CREATE TABLE' AND v_schema = 'public' THEN
        INSERT INTO platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
        VALUES ('warn','no_new_public_tables', v_schema||'.'||v_rel, cmd.command_tag,
                'Doctrine §7: public keeps functions/RPCs, no tables. Put the table in its feature schema (or use platform.create_entity_table).');
        RAISE WARNING 'ddl_guard[no_new_public_tables]: %.% — public keeps no tables; use a feature schema.', v_schema, v_rel;
      END IF;

      IF EXISTS (SELECT 1 FROM pg_attribute a
                 WHERE a.attrelid = cmd.objid AND NOT a.attisdropped
                   AND ((a.attname IN ('is_deleted','deleted') AND a.atttypid = 'boolean'::regtype)
                     OR (a.attname = 'is_public' AND a.atttypid = 'boolean'::regtype)
                     OR a.attname = 'org_id')) THEN
        INSERT INTO platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
        VALUES ('warn','kill_list_columns', v_schema||'.'||v_rel, cmd.command_tag,
                'Kill-list column present (is_deleted/is_public boolean, org_id). Canonical: deleted_at timestamptz, visibility enum, organization_id. (db-rules §2.)');
        RAISE WARNING 'ddl_guard[kill_list_columns]: %.% carries a kill-list column — use deleted_at / visibility / organization_id.', v_schema, v_rel;
      END IF;

      IF cmd.command_tag = 'CREATE TABLE'
         AND (SELECT count(*) FROM pg_constraint fk
              WHERE fk.conrelid = cmd.objid AND fk.contype = 'f'
                AND EXISTS (SELECT 1 FROM platform.entity_types e
                            WHERE e.is_active AND e.table_ref = fk.confrelid)) >= 2
         AND NOT EXISTS (SELECT 1 FROM pg_attribute a
                         WHERE a.attrelid = cmd.objid AND a.attname = 'created_at' AND NOT a.attisdropped) THEN
        INSERT INTO platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
        VALUES ('warn','junction_table', v_schema||'.'||v_rel, cmd.command_tag,
                'Looks like an x_y junction (>=2 entity FKs, no lifecycle columns). A new junction table is a bug — anything-to-anything is a row in platform.associations (assoc_link). (db-rules §3.)');
        RAISE WARNING 'ddl_guard[junction_table]: %.% looks like a junction table — use platform.associations instead.', v_schema, v_rel;
      END IF;

      IF EXISTS (SELECT 1 FROM pg_attribute a
                 WHERE a.attrelid = cmd.objid AND a.attname = 'organization_id'
                   AND a.attnotnull AND NOT a.atthasdef AND NOT a.attisdropped)
         AND NOT EXISTS (SELECT 1 FROM pg_trigger t
                         WHERE t.tgrelid = cmd.objid AND NOT t.tgisinternal
                           AND t.tgfoid::regproc::text IN
                               ('public._stamp_org_default','platform.inherit_org_from_parent')) THEN
        INSERT INTO platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
        VALUES ('warn','org_not_null_no_backstop', v_schema||'.'||v_rel, cmd.command_tag,
                'organization_id NOT NULL with no default and no backstop trigger yet. Attach _stamp_org_default or inherit_org_from_parent in this same migration or org-forgetting writes 500. (db-rules §2.)');
        RAISE WARNING 'ddl_guard[org_not_null_no_backstop]: %.% — attach the org backstop trigger in this migration.', v_schema, v_rel;
      END IF;

      IF cmd.command_tag = 'CREATE TABLE'
         AND NOT EXISTS (SELECT 1 FROM platform.entity_types e
                         WHERE e.schema_name = v_schema AND e.table_name = v_rel)
         AND (SELECT count(*) FROM pg_attribute a
              WHERE a.attrelid = cmd.objid AND NOT a.attisdropped
                AND a.attname IN ('created_by','created_at','updated_at','deleted_at','metadata','version','visibility')) >= 3 THEN
        INSERT INTO platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
        VALUES ('notice','hand_rolled_entity', v_schema||'.'||v_rel, cmd.command_tag,
                'Entity-looking table created outside platform.create_entity_table. The provisioner builds columns+registry+triggers+RLS and rolls back on any gate FAIL. Register this table in entity_types (doctrine §9).');
        RAISE WARNING 'ddl_guard[hand_rolled_entity]: %.% looks like a persistent entity — platform.create_entity_table is the sanctioned path; register it in entity_types.', v_schema, v_rel;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- the WARN lane may NEVER abort DDL; scream that the guard itself is sick
      RAISE WARNING 'ddl_guard: warn-lane internal error (%) — guard needs repair, DDL allowed', SQLERRM;
    END;
  END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS ddl_guard;
CREATE EVENT TRIGGER ddl_guard ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE','ALTER TABLE','CREATE FUNCTION')
  EXECUTE FUNCTION platform._ddl_guard();
