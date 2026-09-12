-- dd154 — PREPARED ONLY. Apply only through `pnpm db:apply` after owner + Sol review.
--
-- The emergency contract is explicit organization ownership at every writer.  This
-- migration blocks future automatic organization assignment; it deliberately does
-- not detach the historical attachments/defaults that their owning family has not
-- yet migrated.  It patches the *live* definitions and refuses unknown shapes so
-- concurrent changes cannot be silently reverted by an old migration snapshot.

DO $migration$
DECLARE
  v_guard_body text;
  v_guard_new text;
  v_provisioner_body text;
  v_provisioner_new text;
  v_guard_marker_pattern constant text := E'    IF cmd[[:space:]]+\\.[[:space:]]*command_tag[[:space:]]+NOT[[:space:]]+IN[[:space:]]*\\(''CREATE TABLE''[[:space:]]*,[[:space:]]*''ALTER TABLE''\\)[[:space:]]+THEN[[:space:]]+CONTINUE;[[:space:]]+END IF;';
  v_guard_replacement constant text := $patch$
    -- DB-T02: new organization defaults and known assignment triggers are forbidden.
    -- This code runs before the table-only branch because CREATE TRIGGER has a trigger
    -- OID, not a relation OID.  OID comparisons are schema-qualified at resolution
    -- time; never compare regproc-rendered text (it drops schemas on search_path).
    v_known_assignment_oids := ARRAY[
      to_regprocedure('ops._stamp_capture_org()'),
      to_regprocedure('plan._stamp_from_node()'),
      to_regprocedure('platform.inherit_org_from_parent()'),
      to_regprocedure('platform.stamp_run_org()'),
      to_regprocedure('public._stamp_org_default()'),
      to_regprocedure('public.dm_default_org()'),
      to_regprocedure('public.files_inherit_org_from_folder()'),
      to_regprocedure('users._stamp_secret_audit_org()')
    ];
    IF cmd.command_tag = 'CREATE FUNCTION' THEN
      SELECT p.prosrc INTO v_function_source FROM pg_proc p WHERE p.oid = cmd.objid;
      IF v_function_source ~* 'NEW[[:space:]]*[.][[:space:]]*organization_id[[:space:]]*:='
         OR v_function_source ~* '(^|[;]|BEGIN|THEN)[[:space:]]*NEW[[:space:]]*[.][[:space:]]*organization_id[[:space:]]*=[[:space:]]*[^=]'
         OR EXISTS (
              SELECT 1 FROM pg_proc known
              WHERE known.oid = ANY(v_known_assignment_oids)
                AND known.prosrc = v_function_source
            ) THEN
        RAISE EXCEPTION 'ddl_guard: % creates or clones an organization-assignment trigger function', cmd.object_identity
          USING HINT = 'Writers must supply organization_id explicitly. A validation-only trigger may refuse a missing value, but no trigger/function may assign one.',
                ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF cmd.command_tag = 'CREATE TRIGGER' AND EXISTS (
      SELECT 1 FROM pg_trigger t
      WHERE t.oid = cmd.objid AND NOT t.tgisinternal
        AND t.tgfoid = ANY(v_known_assignment_oids)
    ) THEN
      RAISE EXCEPTION 'ddl_guard: % attaches a forbidden organization-assignment function', cmd.object_identity
        USING HINT = 'Supply organization_id at the writer. Historical attachments are migration debt and cannot be added, renamed, or recreated.',
              ERRCODE = 'check_violation';
    END IF;

    -- DB-T02 frozen debt: only these exact existing default identities/bodies may
    -- remain. This catalog comparison does not inspect the migration's query text,
    -- so unrelated ALTER TABLE work on one of these tables stays legal.
    IF cmd.command_tag IN ('CREATE TABLE','ALTER TABLE') THEN
      SELECT d.oid, n.nspname || '.' || c.relname, md5(pg_get_expr(d.adbin, d.adrelid))
        INTO v_default_oid, v_default_ref, v_default_md5
      FROM pg_attrdef d
      JOIN pg_class c ON c.oid = d.adrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
      WHERE d.adrelid = cmd.objid AND a.attname = 'organization_id' AND NOT a.attisdropped;
      IF v_default_ref IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM (VALUES
             (1702067::oid,'admin.feature_docs','74188ac5336e8d3bf1a14eee28fc6297'),
             (3421071::oid,'context.system_context_item','74188ac5336e8d3bf1a14eee28fc6297'),
             (1700870::oid,'education.learn_doc','74188ac5336e8d3bf1a14eee28fc6297'),
             (1700228::oid,'platform.output_feedback','4f5b09b52e1a7f210b4c0d8b8bfa8cb9'),
             (1709788::oid,'seo.keyword','74188ac5336e8d3bf1a14eee28fc6297'),
             (1709833::oid,'seo.keyword_edge','74188ac5336e8d3bf1a14eee28fc6297'),
             (1709854::oid,'seo.keyword_market','74188ac5336e8d3bf1a14eee28fc6297'),
             (1709882::oid,'seo.keyword_topic','74188ac5336e8d3bf1a14eee28fc6297'),
             (1710180::oid,'seo.topic','74188ac5336e8d3bf1a14eee28fc6297')
           ) AS debt(attrdef_oid, object_ref, definition_md5)
           WHERE debt.attrdef_oid = v_default_oid
             AND debt.object_ref = v_default_ref AND debt.definition_md5 = v_default_md5
         ) THEN
        RAISE EXCEPTION 'ddl_guard: % adds or changes an organization_id default', v_default_ref
          USING HINT = 'Supply organization_id explicitly at every insert/RPC/job boundary. The nine frozen defaults are historical debt; no new identity or definition is allowed.',
                ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF cmd.command_tag NOT IN ('CREATE TABLE','ALTER TABLE') THEN CONTINUE; END IF;$patch$;
  v_provisioner_start constant text := E'BEGIN\n  -- THE COOPERATION MARKER';
  v_provisioner_start_replacement constant text := E'BEGIN\n  -- DB-T09: reject the legacy automatic-assignment option before the provisioner\n  -- sets its marker or creates any relation, index, registry row, trigger, or RLS.\n  -- Keep the argument in this signature until every caller has migrated.\n  IF p_org_default THEN\n    RAISE EXCEPTION ''create_entity_table: p_org_default=true is forbidden''\n      USING HINT = ''Supply organization_id explicitly in every writer; migrate this caller to p_org_default => false before provisioning the table.'';\n  END IF;\n\n  -- THE COOPERATION MARKER';
  v_provisioner_assignment constant text := E'  IF p_org_default THEN\n    EXECUTE format(''CREATE TRIGGER _stamp_org_default BEFORE INSERT ON %I.%I FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default()'', p_schema,p_table);\n  END IF;';
  v_provisioner_assignment_replacement constant text := E'  -- No organization-assignment trigger: every writer supplies organization_id explicitly.';
  v_owner oid;
  v_owner_name text;
  v_enabled "char";
  v_tags text[];
  v_default_debt_count integer;
  v_guard_def text;
  v_provisioner_def text;
  v_old_advice_start integer;
  v_old_advice_end integer;
BEGIN
  SELECT e.evtowner, r.rolname, e.evtenabled, e.evttags
    INTO v_owner, v_owner_name, v_enabled, v_tags
  FROM pg_event_trigger e JOIN pg_roles r ON r.oid = e.evtowner
  WHERE e.evtname = 'ddl_guard' AND e.evtevent = 'ddl_command_end';
  IF NOT FOUND OR v_enabled <> 'O'
     OR v_tags IS DISTINCT FROM ARRAY['CREATE TABLE','ALTER TABLE','CREATE FUNCTION']::text[] THEN
    RAISE EXCEPTION 'dd154: ddl_guard precondition failed (owner %, enabled %, tags %); re-read live catalog before applying', v_owner, v_enabled, v_tags;
  END IF;

  v_guard_def := pg_get_functiondef('platform._ddl_guard()'::regprocedure);
  v_guard_body := split_part(v_guard_def, '$function$', 2);
  IF position('rls_generator_planner_trap' IN v_guard_body) = 0 THEN
    RAISE EXCEPTION 'dd154: live ddl_guard lacks rls_generator_planner_trap; refusing to replace a stale body';
  END IF;
  -- Fresh-capture precondition: the permanent guard exemptions are exactly the
  -- nine catalog rows measured at prepare time, including their attrdef OIDs.
  SELECT count(*) INTO v_default_debt_count
  FROM pg_attrdef d
  JOIN pg_class c ON c.oid = d.adrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
  JOIN (VALUES
    (1702067::oid,'admin.feature_docs','74188ac5336e8d3bf1a14eee28fc6297'),
    (3421071::oid,'context.system_context_item','74188ac5336e8d3bf1a14eee28fc6297'),
    (1700870::oid,'education.learn_doc','74188ac5336e8d3bf1a14eee28fc6297'),
    (1700228::oid,'platform.output_feedback','4f5b09b52e1a7f210b4c0d8b8bfa8cb9'),
    (1709788::oid,'seo.keyword','74188ac5336e8d3bf1a14eee28fc6297'),
    (1709833::oid,'seo.keyword_edge','74188ac5336e8d3bf1a14eee28fc6297'),
    (1709854::oid,'seo.keyword_market','74188ac5336e8d3bf1a14eee28fc6297'),
    (1709882::oid,'seo.keyword_topic','74188ac5336e8d3bf1a14eee28fc6297'),
    (1710180::oid,'seo.topic','74188ac5336e8d3bf1a14eee28fc6297')
  ) AS debt(attrdef_oid, object_ref, definition_md5)
    ON debt.attrdef_oid = d.oid
   AND debt.object_ref = n.nspname || '.' || c.relname
   AND debt.definition_md5 = md5(pg_get_expr(d.adbin, d.adrelid))
  WHERE a.attname = 'organization_id' AND NOT a.attisdropped;
  IF v_default_debt_count <> 9 THEN
    RAISE EXCEPTION 'dd154: frozen organization-default debt changed (expected 9 exact attrdef rows, found %); re-read live catalog before applying', v_default_debt_count;
  END IF;
  IF position(v_guard_replacement IN v_guard_body) = 0 THEN
    IF regexp_count(v_guard_body, v_guard_marker_pattern) <> 1 THEN
      RAISE EXCEPTION 'dd154: ddl_guard table-only marker is unrecognized; re-read pg_get_functiondef and update this surgical transform';
    END IF;
    v_guard_new := regexp_replace(v_guard_body, v_guard_marker_pattern, v_guard_replacement);
    v_guard_new := replace(v_guard_new,
      '  v_schema text; v_rel text; v_kind "char"; v_ispart boolean;',
      E'  v_schema text; v_rel text; v_kind "char"; v_ispart boolean;\n  v_known_assignment_oids oid[]; v_function_source text; v_default_oid oid; v_default_ref text; v_default_md5 text;');
    IF position('v_known_assignment_oids oid[]' IN v_guard_new) = 0 THEN
      RAISE EXCEPTION 'dd154: ddl_guard declaration marker is unrecognized; refusing to guess';
    END IF;
    v_old_advice_start := position('      IF EXISTS (SELECT 1 FROM pg_attribute a' || E'\n                 WHERE a.attrelid = cmd.objid AND a.attname = ''organization_id''' IN v_guard_new);
    v_old_advice_end := position(E'\n      -- RED: an ALTER' IN v_guard_new);
    IF v_old_advice_start = 0 OR v_old_advice_end <= v_old_advice_start THEN
      RAISE EXCEPTION 'dd154: org_not_null_no_backstop block shape is unrecognized; refusing to guess';
    END IF;
    v_guard_new := overlay(v_guard_new placing '' from v_old_advice_start for v_old_advice_end - v_old_advice_start);
    IF position('org_not_null_no_backstop' IN v_guard_new) > 0 THEN
      RAISE EXCEPTION 'dd154: obsolete org_not_null_no_backstop advice survived transform';
    END IF;
    EXECUTE split_part(v_guard_def, '$function$', 1) || '$function$' || v_guard_new || '$function$';
  END IF;

  v_provisioner_def := pg_get_functiondef('platform.create_entity_table(text,text,text,text,text[],text,boolean,boolean,text,boolean,boolean,boolean,boolean,text[])'::regprocedure);
  v_provisioner_body := split_part(v_provisioner_def, '$function$', 2);
  IF position('p_org_default=true is forbidden' IN v_provisioner_body) = 0 THEN
    IF (length(v_provisioner_body) - length(replace(v_provisioner_body, v_provisioner_start, ''))) / length(v_provisioner_start) <> 1
       OR (length(v_provisioner_body) - length(replace(v_provisioner_body, v_provisioner_assignment, ''))) / length(v_provisioner_assignment) <> 1 THEN
      RAISE EXCEPTION 'dd154: create_entity_table p_org_default shape is unrecognized; re-read live definition before applying';
    END IF;
    v_provisioner_new := replace(v_provisioner_body, v_provisioner_start, v_provisioner_start_replacement);
    v_provisioner_new := replace(v_provisioner_new, v_provisioner_assignment, v_provisioner_assignment_replacement);
    EXECUTE split_part(v_provisioner_def, '$function$', 1) || '$function$' || v_provisioner_new || '$function$';
  END IF;

  -- PostgreSQL has no ALTER EVENT TRIGGER tag clause. Recreate only the binding,
  -- then restore the exact owner/enable state captured above inside this transaction.
  DROP EVENT TRIGGER ddl_guard;
  CREATE EVENT TRIGGER ddl_guard ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE','ALTER TABLE','CREATE FUNCTION','CREATE TRIGGER')
    EXECUTE FUNCTION platform._ddl_guard();
  EXECUTE format('ALTER EVENT TRIGGER ddl_guard OWNER TO %I', v_owner_name);
  IF v_enabled = 'D' THEN ALTER EVENT TRIGGER ddl_guard DISABLE;
  ELSIF v_enabled = 'R' THEN ALTER EVENT TRIGGER ddl_guard ENABLE REPLICA;
  ELSIF v_enabled = 'A' THEN ALTER EVENT TRIGGER ddl_guard ENABLE ALWAYS;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_event_trigger
    WHERE evtname = 'ddl_guard' AND evtevent = 'ddl_command_end'
      AND evtowner = v_owner AND evtenabled = v_enabled
      AND evttags = ARRAY['CREATE TABLE','ALTER TABLE','CREATE FUNCTION','CREATE TRIGGER']::text[]
  ) THEN
    RAISE EXCEPTION 'dd154: ddl_guard owner, enable state, or tag contract did not survive';
  END IF;
  IF position('rls_generator_planner_trap' IN pg_get_functiondef('platform._ddl_guard()'::regprocedure)) = 0
     OR position('p_org_default=true is forbidden' IN pg_get_functiondef('platform.create_entity_table(text,text,text,text,text[],text,boolean,boolean,text,boolean,boolean,boolean,boolean,text[])'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'dd154: postcondition failed; intended guard/provisioner transform did not persist';
  END IF;
END
$migration$;
