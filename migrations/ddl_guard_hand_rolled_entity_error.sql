-- ddl_guard: flip `hand_rolled_entity` from WARN to ERROR.
-- Applied live 2026-08-21 (drift-audit adjudication, Arman-directed in-session).
--
-- WHY NOW. G1 (projects/archive/db-changeover-2026-08/db-hardening-proposals.md, "Evaluated
-- and NOT proposed") rejected a hard block on hand-rolled entity tables for exactly two
-- reasons, and gave the exact condition for revisiting it:
--     "Revisit as ERROR only after the provisioner's component variant is fixed and a
--      set_config('matrx.provisioner', ...) marker exists."
-- Both preconditions are now met:
--   1. the component variant was fixed by aidream/db/migrations/
--      0364_create_entity_table_component_parents.sql (2026-08-15), which retired the
--      create-as-entity-then-flip workaround the warn tier was protecting;
--   2. this migration adds the cooperation marker (below).
-- And the warn tier demonstrably does not work: 64 hand-rolled entity-like tables were
-- created in the 6 days after 2026-08-15, every one of them logged to
-- platform.ddl_guard_log and every one of them ignored.
--
-- WHAT CHANGES. Exactly two things, and nothing else:
--   (1) platform.create_entity_table sets a transaction-local marker
--       set_config('matrx.provisioner','1', true) at the top of its body, and clears it
--       ('0') immediately before RETURN. The provisioner must announce itself because
--       provenance is not otherwise visible from inside an event trigger — and because the
--       provisioner's own CREATE TABLE runs BEFORE it writes the platform.entity_types row,
--       so the rule would otherwise abort the sanctioned path itself.
--   (2) platform._ddl_guard() moves `hand_rolled_entity` out of the WARN lane and into the
--       ERROR lane as rule (d). Same detection shape as before (CREATE TABLE + not
--       registered in entity_types + >=3 base-contract columns), plus the marker check.
--
-- WHAT DOES NOT CHANGE. No other rule changes severity. ERROR lane (a) visibility-type,
-- (b) project_id FK, (c) _mirror_fk_to_assoc are untouched; the WARN lane keeps
-- no_new_public_tables, kill_list_columns, junction_table, org_not_null_no_backstop, still
-- exception-wrapped so a bug there can never abort DDL. No grants, no RLS, no policy changes.
--
-- ESCAPE HATCH (unchanged, and now named in the error text): ALTER EVENT TRIGGER ddl_guard
-- DISABLE; <your DDL>; ALTER EVENT TRIGGER ddl_guard ENABLE;  -- in one transaction.
--
-- The event trigger itself is NOT recreated here: CREATE EVENT TRIGGER needs superuser and
-- the binding already exists. CREATE OR REPLACE FUNCTION is enough — the trigger resolves
-- the function by OID. `pg_event_trigger` remains the only proof a guard is live (db-rules
-- §1); both release gates now assert the 5 expected platform rows.

-- ============================================================================
-- (1) The cooperation marker — platform.create_entity_table
-- ============================================================================

CREATE OR REPLACE FUNCTION platform.create_entity_table(p_schema text, p_table text, p_token text, p_label text, p_fields text[], p_variant text, p_versioned boolean, p_soft_delete boolean, p_visibility text, p_category boolean, p_listed boolean, p_org_default boolean, p_gin_jsonb boolean, p_parents text[] DEFAULT NULL::text[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_cols text; v_f text; v_colname text; v_fails text; v_has_vis boolean;
  v_parent text; v_parent_token text; v_fk_column text;
BEGIN
  -- THE COOPERATION MARKER (2026-08-21). Transaction-local: it tells platform._ddl_guard()
  -- that the CREATE TABLE below came from the sanctioned provisioner, not a hand-rolled
  -- migration. Without it the guard's hand_rolled_entity rule -- an ERROR since this date --
  -- would abort the provisioner's own DDL, because the entity_types row is not written until
  -- after the table exists. is_local => Postgres discards it at transaction end; it is also
  -- reset explicitly before RETURN so the marker covers exactly this function body.
  PERFORM set_config('matrx.provisioner', '1', true);

  IF to_regclass(format('%I.%I',p_schema,p_table)) IS NOT NULL THEN
    RAISE EXCEPTION 'create_entity_table: %.% already exists', p_schema, p_table; END IF;
  IF p_variant NOT IN ('entity','component','ledger','system') THEN
    RAISE EXCEPTION 'create_entity_table: invalid variant %', p_variant; END IF;

  v_has_vis := (p_visibility <> 'none');
  IF v_has_vis THEN PERFORM p_visibility::platform.visibility; END IF;   -- validates the value
  IF p_variant='system' AND NOT v_has_vis THEN
    RAISE EXCEPTION 'create_entity_table: system variant requires a visibility value (not ''none'')'; END IF;
  -- A component carries the full base contract MINUS visibility: its access is already
  -- fully determined by its parent, so a visibility column is a second, competing access
  -- authority (changeover doctrine section 5). Unreachable before this migration -- the
  -- component variant could not be created at all -- which is exactly how the
  -- create-as-entity-then-flip workaround left a stray visibility column on the four
  -- components that used it.
  IF p_variant='component' AND v_has_vis THEN
    RAISE EXCEPTION 'create_entity_table: component % must not have visibility (pass p_visibility => ''none''); a component''s access is its parent''s', p_token;
  END IF;

  -- A component's access IS its parent's, so the parents must be declared here: they
  -- cannot be inserted before this call (FK to the entity_types row below) and they
  -- must exist before iam.apply_rls builds the policies.
  IF p_variant='component' AND COALESCE(array_length(p_parents,1),0) = 0 THEN
    RAISE EXCEPTION 'create_entity_table: component % requires p_parents (entries shaped ''parent_token:fk_column'')', p_token;
  END IF;
  IF p_variant<>'component' AND COALESCE(array_length(p_parents,1),0) > 0 THEN
    RAISE EXCEPTION 'create_entity_table: p_parents declares composition parents and is only valid for p_variant=''component'' (got %)', p_variant;
  END IF;

  FOREACH v_f IN ARRAY COALESCE(p_fields,'{}') LOOP
    v_colname := lower(split_part(btrim(v_f),' ',1));
    IF v_colname IN ('id','organization_id','created_by','updated_by','created_at','updated_at',
                     'deleted_at','version','metadata','visibility','category_id') THEN
      RAISE EXCEPTION 'create_entity_table: custom field "%" collides with a base column', v_colname; END IF;
  END LOOP;

  v_cols := 'id uuid PRIMARY KEY DEFAULT gen_random_uuid()';
  FOREACH v_f IN ARRAY COALESCE(p_fields,'{}') LOOP v_cols := v_cols || ', ' || v_f; END LOOP;
  v_cols := v_cols || ', organization_id uuid NOT NULL REFERENCES iam.organizations(id)';
  v_cols := v_cols || ', created_by uuid REFERENCES auth.users(id)';
  v_cols := v_cols || ', updated_by uuid REFERENCES auth.users(id)';
  v_cols := v_cols || ', created_at timestamptz NOT NULL DEFAULT now()';
  v_cols := v_cols || ', updated_at timestamptz NOT NULL DEFAULT now()';
  IF p_soft_delete THEN v_cols := v_cols || ', deleted_at timestamptz'; END IF;
  v_cols := v_cols || ', version integer NOT NULL DEFAULT 1';
  v_cols := v_cols || ', metadata jsonb NOT NULL DEFAULT ''{}''::jsonb';
  IF v_has_vis THEN
    v_cols := v_cols || format(', visibility platform.visibility NOT NULL DEFAULT %L::platform.visibility', p_visibility);
  END IF;
  IF p_category THEN v_cols := v_cols || ', category_id uuid REFERENCES platform.categories(id)'; END IF;

  EXECUTE format('CREATE TABLE %I.%I (%s)', p_schema, p_table, v_cols);

  EXECUTE format('CREATE INDEX ON %I.%I (organization_id)', p_schema, p_table);
  EXECUTE format('CREATE INDEX ON %I.%I (created_by)', p_schema, p_table);
  IF p_category THEN EXECUTE format('CREATE INDEX ON %I.%I (category_id)', p_schema, p_table); END IF;
  IF p_gin_jsonb THEN
    FOREACH v_f IN ARRAY COALESCE(p_fields,'{}') LOOP
      IF v_f ~* '\yjsonb\y' THEN
        v_colname := split_part(btrim(v_f),' ',1);
        EXECUTE format('CREATE INDEX ON %I.%I USING gin (%I)', p_schema, p_table, v_colname);
      END IF;
    END LOOP;
  END IF;

  INSERT INTO platform.entity_types(
    token,schema_name,table_name,label,is_versioned,has_soft_delete,is_component,is_listed,
    default_visibility,rls_variant,table_ref,is_active)
  VALUES (p_token,p_schema,p_table,p_label,p_versioned,p_soft_delete,(p_variant='component'),p_listed,
    CASE WHEN v_has_vis THEN p_visibility::platform.visibility ELSE NULL END,
    p_variant, format('%I.%I',p_schema,p_table)::regclass, true);

  -- THE WINDOW THE COMPONENT VARIANT NEEDED. The entity_types row now exists, so the
  -- child_type FK resolves; iam.apply_rls has not run yet, so its parent check passes.
  IF COALESCE(array_length(p_parents,1),0) > 0 THEN
    FOREACH v_parent IN ARRAY p_parents LOOP
      v_parent_token := btrim(split_part(v_parent, ':', 1));
      v_fk_column    := btrim(split_part(v_parent, ':', 2));
      IF v_parent_token = '' OR v_fk_column = '' OR strpos(v_parent, ':') = 0 THEN
        RAISE EXCEPTION 'create_entity_table: p_parents entry "%" is not shaped ''parent_token:fk_column''', v_parent;
      END IF;
      -- Named here rather than left to the FK / to a policy that references a missing
      -- column, so a typo reports itself instead of a generic constraint failure.
      IF NOT EXISTS (SELECT 1 FROM platform.entity_types et WHERE et.token = v_parent_token) THEN
        RAISE EXCEPTION 'create_entity_table: p_parents entry "%" names unknown parent token %', v_parent, v_parent_token;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
         WHERE c.table_schema = p_schema AND c.table_name = p_table AND c.column_name = v_fk_column
      ) THEN
        RAISE EXCEPTION 'create_entity_table: p_parents entry "%" names column % which %.% does not have',
          v_parent, v_fk_column, p_schema, p_table;
      END IF;
      INSERT INTO platform.entity_relationships(child_type,parent_type,fk_column,kind)
      VALUES (p_token, v_parent_token, v_fk_column, 'composition');
    END LOOP;
  END IF;

  EXECUTE format('CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor()', p_schema,p_table);
  IF p_org_default THEN
    EXECUTE format('CREATE TRIGGER _stamp_org_default BEFORE INSERT ON %I.%I FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default()', p_schema,p_table);
  END IF;
  EXECUTE format('CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._touch_row()', p_schema,p_table);
  IF p_versioned THEN
    EXECUTE format('CREATE TRIGGER _version_capture AFTER INSERT OR DELETE OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION platform._version_capture(%L)', p_schema,p_table,p_token);
  END IF;

  -- Wire the association-GC trigger(s): every entity that can appear as a
  -- source/target in platform.associations must have its rows swept on delete.
  PERFORM platform.sync_association_gc_triggers(p_token);

  PERFORM iam.apply_rls(p_schema,p_table,p_token,p_variant);

  SELECT string_agg(check_name||COALESCE(': '||detail,''), '; ')
    INTO v_fails FROM iam.verify_canonical(p_schema,p_table,p_token) WHERE status='FAIL';
  IF v_fails IS NOT NULL THEN
    RAISE EXCEPTION 'create_entity_table: %.% failed canonical verify: %', p_schema,p_table,v_fails; END IF;

  PERFORM set_config('matrx.provisioner', '0', true);   -- close the window; see the marker note above
  RETURN format('%s.%s created + canonical (variant=%s versioned=%s soft_delete=%s visibility=%s category=%s listed=%s parents=%s)',
                p_schema,p_table,p_variant,p_versioned,p_soft_delete,p_visibility,p_category,p_listed,
                COALESCE(array_to_string(p_parents,','),'none'));
END; $function$
;

-- ============================================================================
-- (2) The guard — platform._ddl_guard()
-- ============================================================================

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

    -- ERROR lane (d): entity-looking table created outside the provisioner (2026-08-21)
    -- Was the WARN-tier `hand_rolled_entity` rule from 2026-08-12. The G1 proposal deferred the
    -- hard block on two preconditions, both now met: the provisioner's `component` variant was
    -- fixed (aidream 0364_create_entity_table_component_parents.sql, 2026-08-15) and the
    -- cooperation marker `matrx.provisioner` now exists (set transaction-local at the top of
    -- platform.create_entity_table). The warning tier demonstrably did not hold the line — 64
    -- hand-rolled entity-like tables were created in the 6 days after the component fix, every
    -- one of them logged and ignored. Arman ratified the flip 2026-08-21.
    IF cmd.command_tag = 'CREATE TABLE'
       AND COALESCE(current_setting('matrx.provisioner', true), '') <> '1'
       AND NOT EXISTS (SELECT 1 FROM platform.entity_types e
                       WHERE e.schema_name = v_schema AND e.table_name = v_rel)
       AND (SELECT count(*) FROM pg_attribute a
            WHERE a.attrelid = cmd.objid AND NOT a.attisdropped
              AND a.attname IN ('created_by','created_at','updated_at','deleted_at','metadata','version','visibility')) >= 3 THEN
      RAISE EXCEPTION 'ddl_guard: %.% is an entity-looking table created outside platform.create_entity_table', v_schema, v_rel
        USING HINT = 'Use platform.create_entity_table — see db-rules §2. It builds columns+registry+triggers+RLS in one transaction and rolls back on any gate FAIL; a hand-rolled table is unregistered, so iam.has_access returns false for it and it has no RLS. If this table genuinely must be hand-built, disable the guard for the migration and re-enable it in the same transaction: ALTER EVENT TRIGGER ddl_guard DISABLE; <your DDL>; ALTER EVENT TRIGGER ddl_guard ENABLE;',
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

    EXCEPTION WHEN OTHERS THEN
      -- the WARN lane may NEVER abort DDL; scream that the guard itself is sick
      RAISE WARNING 'ddl_guard: warn-lane internal error (%) — guard needs repair, DDL allowed', SQLERRM;
    END;
  END LOOP;
END;
$$;
