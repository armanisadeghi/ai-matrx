-- NO NULL ORG — the two ui surface scope-tier tables LEAVE the grandfather list
-- =====================================================================
-- db-rules §2 "NO NULL ORG" (owner ruling 2026-08-21).
--
-- "A table leaves this list by being FIXED, never by being excused."
--
-- Both were fixed by `migrations/org_null_ban_ui_surface_scope_tiers.sql`,
-- which re-founded their scope-tier model so `organization_id` is the row's
-- owning org on every tier (global = the matrx-system org) rather than a tier
-- flag whose NULL meant "global", then flipped the column NOT NULL with the
-- org backstops attached in the same transaction:
--
--   ui.ui_surface_agent_pref    nullable -> NOT NULL  (4 rows, all owned)
--   ui.ui_surface_config        nullable -> NOT NULL  (0 rows)
--
-- so lane (e)'s ALTER-TABLE grandfather has nothing left to forgive on them.
--
-- Grandfather list: 34 -> 32. Nothing else in the function changes — the body
-- below is the LIVE definition read back from the database at authoring time
-- (post `org_null_ban_ddl_guard_grandfather_shrink.sql`, which shrank 38 -> 34
-- earlier the same day), with the two names dropped. Taken from the live
-- function rather than from any migration FILE on purpose: several lanes are
-- shrinking this same array today, and rebuilding from a stale file would
-- silently re-grandfather whatever another lane had just fixed.

CREATE OR REPLACE FUNCTION platform._ddl_guard()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
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
  -- NO NULL ORG (owner ruling, 2026-08-21). Grandfathered nullable-org tables:
  -- the live census at apply time, MINUS the three this ruling's migrations fix
  -- (seo.gsc_dig_rule, seo.keyword_class_rule, users.profiles), MINUS the four the
  -- transcripts studio lane fixed 2026-08-21, MINUS the two ui surface scope-tier
  -- tables fixed by org_null_ban_ui_surface_scope_tiers.sql. These 32 are the
  -- legacy backlog, and the backlog is the RATCHET's business, not this guard's
  -- -- hard-failing every unrelated ALTER on them would block releases that have
  -- nothing to do with organization_id. A table leaves this list by being fixed.
  c_nullorg_grandfather CONSTANT text[] := ARRAY[
    'dictionary.dict_entries', 'docproc.processed_documents',
    'education.study_structured_section', 'ops.system_error',
    'ops.system_write_failure',
    'platform._bak_assoc_file_processed_document_20260812',
    'platform.assists', 'platform.associations',
    'platform.retention_policy', 'platform.share_links',
    'rag.context_item_suggestions', 'rag.data_stores', 'rag.kg_alerts',
    'rag.kg_chunks', 'rag.kg_suggestion_ack', 'rag.kg_value_matches',
    'rag.library_docs', 'rag.ner_canonicalizer_shadow',
    'rag.scope_association_suggestions',
    'rag.scope_item_value_suggestions', 'rag.scope_suggestions',
    'research.rs_context_bundle', 'users.credential_items',
    'users.integration_connections', 'users.invitation_codes',
    'users.invitation_requests', 'users.user_secrets',
    'workbench.udt_dataset_fields', 'workbench.udt_dataset_rows',
    'workbench.udt_documents', 'workbench.udt_structured_list_items',
    'workbench.udt_structured_lists'
  ];
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

    -- ERROR lane (e): NO NULL ORG at birth (owner ruling, 2026-08-21)
    -- "If something belongs to the system, that CANNOT EVER be represented by a
    --  NULL org! ... NO NULL ORG. the system has an org and this is
    --  well-established." (db-rules §2/§6e.)
    -- Hard block, and it costs nothing: platform.create_entity_table has never
    -- emitted a nullable organization_id, so no legitimate creation path can
    -- trip this. It exists because lane (d) only catches UNPROVISIONED
    -- entity-looking tables -- a provisioner-marked or already-registered
    -- CREATE could still have slipped a nullable org column through.
    IF cmd.command_tag = 'CREATE TABLE'
       AND EXISTS (SELECT 1 FROM pg_attribute a
                   WHERE a.attrelid = cmd.objid AND a.attname = 'organization_id'
                     AND NOT a.attisdropped AND NOT a.attnotnull)
       AND (EXISTS (SELECT 1 FROM platform.entity_types e
                    WHERE e.schema_name = v_schema AND e.table_name = v_rel)
            OR (SELECT count(*) FROM pg_attribute a
                WHERE a.attrelid = cmd.objid AND NOT a.attisdropped
                  AND a.attname IN ('created_by','created_at','updated_at','deleted_at','metadata','version','visibility')) >= 3) THEN
      RAISE EXCEPTION 'ddl_guard: %.% is born with a NULLABLE organization_id', v_schema, v_rel
        USING HINT = 'NO NULL ORG (owner ruling 2026-08-21, db-rules §2/§6e). NULL is not a scope: system/global content belongs to the system org (matrx-system, 39c38960-d30c-4840-b0c1-c9960de95582, iam.system_orgs.global_readable), and user content falls back to the creator''s personal org. Declare organization_id uuid NOT NULL REFERENCES iam.organizations(id) and attach the backstop (public._stamp_org_default or platform.inherit_org_from_parent) in this same migration.',
              ERRCODE = 'check_violation';
    END IF;

    -- LOG lane — may NEVER abort DDL (severities: error | warn | notice)
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

      -- D241 (2026-08-21): compare the trigger function by OID, NEVER by
      -- rendered text. `tgfoid::regproc::text` omits the schema for anything on
      -- the search_path, so every one of the 282 live public._stamp_org_default
      -- triggers rendered as the bare `_stamp_org_default`, the IN never
      -- matched, and this rule warned on every qualifying table whether or not
      -- it was correctly backstopped. to_regproc() (not ::regproc) keeps a
      -- future rename of either function in the LOUD direction instead of
      -- throwing inside the warn lane. Same class as db-rules §1's
      -- regclass::text warning.
      --
      -- THREE legal backstops, not two (db-rules §2): the original rule listed
      -- only two, but aidream's BLOCKING gate (matrx_orm.catalog
      -- .org_backstop_coverage, validate_org_backstop_coverage.py) matches
      -- _stamp_org_default / inherit_org_from_parent / _stamp_from_node. The
      -- guard now matches the same three, so the advisory rule and the blocking
      -- gate cannot disagree -- plan.node_artifact and plan.node_step carry
      -- plan._stamp_from_node and are correctly backstopped.
      IF EXISTS (SELECT 1 FROM pg_attribute a
                 WHERE a.attrelid = cmd.objid AND a.attname = 'organization_id'
                   AND a.attnotnull AND NOT a.atthasdef AND NOT a.attisdropped)
         AND NOT EXISTS (SELECT 1 FROM pg_trigger t
                         WHERE t.tgrelid = cmd.objid AND NOT t.tgisinternal
                           AND t.tgfoid IN (to_regproc('public._stamp_org_default'),
                                            to_regproc('platform.inherit_org_from_parent'),
                                            to_regproc('plan._stamp_from_node'))) THEN
        INSERT INTO platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
        VALUES ('warn','org_not_null_no_backstop', v_schema||'.'||v_rel, cmd.command_tag,
                'organization_id NOT NULL with no default and no backstop trigger yet. Attach _stamp_org_default or inherit_org_from_parent in this same migration or org-forgetting writes 500. (db-rules §2.)');
        RAISE WARNING 'ddl_guard[org_not_null_no_backstop]: %.% — attach the org backstop trigger in this migration.', v_schema, v_rel;
      END IF;

      -- RED: an ALTER that LEAVES organization_id nullable on an entity-looking
      -- table. Logged at severity 'error' and screamed, never aborted -- the
      -- grandfathered backlog above is owned by the nullable-org-columns ratchet
      -- (matrx-frontend scripts/canonical-ratchets), which BLOCKS on growth.
      IF cmd.command_tag = 'ALTER TABLE'
         AND v_schema||'.'||v_rel <> ALL (c_nullorg_grandfather)
         AND EXISTS (SELECT 1 FROM pg_attribute a
                     WHERE a.attrelid = cmd.objid AND a.attname = 'organization_id'
                       AND NOT a.attisdropped AND NOT a.attnotnull)
         AND (EXISTS (SELECT 1 FROM platform.entity_types e
                      WHERE e.schema_name = v_schema AND e.table_name = v_rel)
              OR (SELECT count(*) FROM pg_attribute a
                  WHERE a.attrelid = cmd.objid AND NOT a.attisdropped
                    AND a.attname IN ('created_by','created_at','updated_at','deleted_at','metadata','version','visibility')) >= 3) THEN
        INSERT INTO platform.ddl_guard_log(severity, rule, object_ref, command_tag, detail)
        VALUES ('error','nullable_org', v_schema||'.'||v_rel, cmd.command_tag,
                'NO NULL ORG (owner ruling 2026-08-21): this entity-looking table still allows organization_id IS NULL. NULL is not a scope -- system/global content belongs to the system org (matrx-system 39c38960-d30c-4840-b0c1-c9960de95582), user content to the creator''s personal org. Flip it NOT NULL and attach the backstop in ONE migration. (db-rules §2/§6e.)');
        RAISE WARNING 'ddl_guard[nullable_org]: %.% still allows a NULL organization_id — NO NULL ORG (db-rules §2/§6e).', v_schema, v_rel;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- the WARN lane may NEVER abort DDL; scream that the guard itself is sick
      RAISE WARNING 'ddl_guard: warn-lane internal error (%) — guard needs repair, DDL allowed', SQLERRM;
    END;
  END LOOP;
END;
$function$;

-- ── Assertions ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_def text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger
                  WHERE evtname = 'ddl_guard' AND evtenabled <> 'D') THEN
    RAISE EXCEPTION 'ddl_guard event trigger is missing or disabled after this migration';
  END IF;
  v_def := pg_get_functiondef('platform._ddl_guard()'::regprocedure);
  IF position('nullable_org' in v_def) = 0 THEN
    RAISE EXCEPTION 'lane (e) did not survive this replacement';
  END IF;
  IF position('ui.ui_surface_agent_pref' in v_def) > 0
     OR position('ui.ui_surface_config' in v_def) > 0 THEN
    RAISE EXCEPTION 'a ui surface table is still grandfathered — it is fixed, not excused';
  END IF;
  -- Do not let this migration quietly re-grandfather another lane's fix.
  IF position('transcripts.studio_documents' in v_def) > 0 THEN
    RAISE EXCEPTION 'transcripts studio tables reappeared in the grandfather list';
  END IF;
END $$;
