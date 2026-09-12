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
  v_guard_marker_pattern constant text := E'    IF cmd[[:space:]]*\\.[[:space:]]*command_tag[[:space:]]+NOT[[:space:]]+IN[[:space:]]*\\(''CREATE TABLE''[[:space:]]*,[[:space:]]*''ALTER TABLE''\\)[[:space:]]+THEN[[:space:]]+CONTINUE;[[:space:]]+END IF;';
  v_guard_replacement constant text := $patch$
    -- DB-T02: new organization defaults and known assignment triggers are forbidden.
    -- This code runs before the table-only branch because CREATE TRIGGER has a trigger
    -- OID, not a relation OID.  OID comparisons are schema-qualified at resolution
    -- time; never compare regproc-rendered text (it drops schemas on search_path).
    IF cmd.command_tag = 'CREATE FUNCTION' THEN
      v_assignment_target_oid := cmd.objid;
    ELSIF cmd.command_tag = 'CREATE TRIGGER' THEN
      SELECT t.tgfoid INTO v_assignment_target_oid
      FROM pg_trigger t WHERE t.oid = cmd.objid AND NOT t.tgisinternal;
    ELSE
      v_assignment_target_oid := NULL;
    END IF;

    IF v_assignment_target_oid IS NOT NULL THEN
      SELECT p.prosrc,
             coalesce(
               (SELECT split_part(v_setting, '=', 2)
                FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS settings(v_setting)
                WHERE split_part(v_setting, '=', 1) = 'standard_conforming_strings'
                LIMIT 1),
               current_setting('standard_conforming_strings')
             ) = 'on'
        INTO v_function_source, v_standard_conforming_strings
      FROM pg_proc p WHERE p.oid = v_assignment_target_oid;
      v_direct_assignment := false;
      v_scan_tokens := ARRAY[]::text[];
      v_scan_pos := 1;
      v_scan_len := length(v_function_source);
      WHILE v_scan_pos <= v_scan_len LOOP
        v_scan_token := substr(v_function_source, v_scan_pos, 1);
        IF v_scan_token ~ '[[:space:]]' THEN
          v_scan_pos := v_scan_pos + 1;
        ELSIF v_scan_token = '-' AND substr(v_function_source, v_scan_pos + 1, 1) = '-' THEN
          v_scan_next_pos := position(E'\\n' IN substr(v_function_source, v_scan_pos + 2));
          v_scan_pos := CASE WHEN v_scan_next_pos = 0 THEN v_scan_len + 1 ELSE v_scan_pos + 1 + v_scan_next_pos END;
        ELSIF v_scan_token = '/' AND substr(v_function_source, v_scan_pos + 1, 1) = '*' THEN
          v_scan_comment_depth := 1;
          v_scan_pos := v_scan_pos + 2;
          WHILE v_scan_pos <= v_scan_len AND v_scan_comment_depth > 0 LOOP
            IF substr(v_function_source, v_scan_pos, 2) = '/*' THEN
              v_scan_comment_depth := v_scan_comment_depth + 1;
              v_scan_pos := v_scan_pos + 2;
            ELSIF substr(v_function_source, v_scan_pos, 2) = '*/' THEN
              v_scan_comment_depth := v_scan_comment_depth - 1;
              v_scan_pos := v_scan_pos + 2;
            ELSE
              v_scan_pos := v_scan_pos + 1;
            END IF;
          END LOOP;
        ELSIF lower(v_scan_token) = 'e' AND substr(v_function_source, v_scan_pos + 1, 1) = '''' THEN
          -- Escape strings always honor backslash escapes. Ordinary strings do
          -- so only when standard_conforming_strings is off (handled below).
          v_scan_pos := v_scan_pos + 2;
          WHILE v_scan_pos <= v_scan_len LOOP
            IF ascii(substr(v_function_source, v_scan_pos, 1)) = 92 THEN
              v_scan_pos := v_scan_pos + 2;
            ELSIF substr(v_function_source, v_scan_pos, 1) = '''' THEN
              IF substr(v_function_source, v_scan_pos + 1, 1) = '''' THEN v_scan_pos := v_scan_pos + 2; ELSE v_scan_pos := v_scan_pos + 1; EXIT; END IF;
            ELSE
              v_scan_pos := v_scan_pos + 1;
            END IF;
          END LOOP;
        ELSIF v_scan_token = '''' THEN
          v_scan_pos := v_scan_pos + 1;
          WHILE v_scan_pos <= v_scan_len LOOP
            IF NOT v_standard_conforming_strings AND ascii(substr(v_function_source, v_scan_pos, 1)) = 92 THEN
              v_scan_pos := v_scan_pos + 2;
            ELSIF substr(v_function_source, v_scan_pos, 1) = '''' THEN
              IF substr(v_function_source, v_scan_pos + 1, 1) = '''' THEN v_scan_pos := v_scan_pos + 2; ELSE v_scan_pos := v_scan_pos + 1; EXIT; END IF;
            ELSE
              v_scan_pos := v_scan_pos + 1;
            END IF;
          END LOOP;
        ELSIF v_scan_token = '$' THEN
          v_scan_dollar_delimiter := (regexp_match(substr(v_function_source, v_scan_pos), '^(\\$[A-Za-z_][A-Za-z_0-9]*\\$|\\$\\$)'))[1];
          IF v_scan_dollar_delimiter IS NULL THEN
            v_scan_tokens := array_append(v_scan_tokens, '$');
            v_scan_pos := v_scan_pos + 1;
          ELSE
            v_scan_next_pos := position(v_scan_dollar_delimiter IN substr(v_function_source, v_scan_pos + length(v_scan_dollar_delimiter)));
            v_scan_pos := CASE WHEN v_scan_next_pos = 0 THEN v_scan_len + 1 ELSE v_scan_pos + length(v_scan_dollar_delimiter) + v_scan_next_pos - 1 + length(v_scan_dollar_delimiter) END;
          END IF;
        ELSIF lower(substr(v_function_source, v_scan_pos, 2)) = 'u&'
              AND substr(v_function_source, v_scan_pos + 2, 1) = '"' THEN
          -- PostgreSQL Unicode-escaped quoted identifiers are identifiers, not
          -- strings. Decode their 4-hex and +6-hex escapes before comparing the
          -- field name, while retaining quoted-identifier case semantics.
          v_scan_raw_identifier := '';
          v_scan_next_pos := v_scan_pos + 3;
          WHILE v_scan_next_pos <= v_scan_len LOOP
            IF substr(v_function_source, v_scan_next_pos, 1) = '"' THEN
              IF substr(v_function_source, v_scan_next_pos + 1, 1) = '"' THEN
                v_scan_raw_identifier := v_scan_raw_identifier || '"';
                v_scan_next_pos := v_scan_next_pos + 2;
              ELSE
                v_scan_next_pos := v_scan_next_pos + 1;
                EXIT;
              END IF;
            ELSE
              v_scan_raw_identifier := v_scan_raw_identifier || substr(v_function_source, v_scan_next_pos, 1);
              v_scan_next_pos := v_scan_next_pos + 1;
            END IF;
          END LOOP;
          IF v_scan_next_pos > v_scan_len + 1 THEN
            RAISE EXCEPTION 'ddl_guard: malformed Unicode-escaped identifier in %', cmd.object_identity
              USING ERRCODE = 'check_violation';
          END IF;
          v_scan_escape_char := chr(92);
          -- Comments and whitespace are interchangeable lexical separators in
          -- PostgreSQL, including around UESCAPE and its one-character string.
          v_scan_uescape_pos := v_scan_next_pos;
          LOOP
            IF substr(v_function_source, v_scan_uescape_pos, 1) ~ '[[:space:]]' THEN
              v_scan_uescape_pos := v_scan_uescape_pos + 1;
            ELSIF substr(v_function_source, v_scan_uescape_pos, 2) = '--' THEN
              v_scan_next_pos := position(E'\n' IN substr(v_function_source, v_scan_uescape_pos + 2));
              v_scan_uescape_pos := CASE WHEN v_scan_next_pos = 0 THEN v_scan_len + 1 ELSE v_scan_uescape_pos + 1 + v_scan_next_pos END;
            ELSIF substr(v_function_source, v_scan_uescape_pos, 2) = '/*' THEN
              v_scan_comment_depth := 1;
              v_scan_uescape_pos := v_scan_uescape_pos + 2;
              WHILE v_scan_uescape_pos <= v_scan_len AND v_scan_comment_depth > 0 LOOP
                IF substr(v_function_source, v_scan_uescape_pos, 2) = '/*' THEN v_scan_comment_depth := v_scan_comment_depth + 1; v_scan_uescape_pos := v_scan_uescape_pos + 2;
                ELSIF substr(v_function_source, v_scan_uescape_pos, 2) = '*/' THEN v_scan_comment_depth := v_scan_comment_depth - 1; v_scan_uescape_pos := v_scan_uescape_pos + 2;
                ELSE v_scan_uescape_pos := v_scan_uescape_pos + 1;
                END IF;
              END LOOP;
            ELSE EXIT;
            END IF;
          END LOOP;
          IF lower(substr(v_function_source, v_scan_uescape_pos, 7)) = 'uescape'
             AND substr(v_function_source, v_scan_uescape_pos + 7, 1) !~ '[A-Za-z_0-9$]' THEN
            v_scan_uescape_pos := v_scan_uescape_pos + 7;
            LOOP
              IF substr(v_function_source, v_scan_uescape_pos, 1) ~ '[[:space:]]' THEN v_scan_uescape_pos := v_scan_uescape_pos + 1;
              ELSIF substr(v_function_source, v_scan_uescape_pos, 2) = '--' THEN
                v_scan_next_pos := position(E'\n' IN substr(v_function_source, v_scan_uescape_pos + 2));
                v_scan_uescape_pos := CASE WHEN v_scan_next_pos = 0 THEN v_scan_len + 1 ELSE v_scan_uescape_pos + 1 + v_scan_next_pos END;
              ELSIF substr(v_function_source, v_scan_uescape_pos, 2) = '/*' THEN
                v_scan_comment_depth := 1; v_scan_uescape_pos := v_scan_uescape_pos + 2;
                WHILE v_scan_uescape_pos <= v_scan_len AND v_scan_comment_depth > 0 LOOP
                  IF substr(v_function_source, v_scan_uescape_pos, 2) = '/*' THEN v_scan_comment_depth := v_scan_comment_depth + 1; v_scan_uescape_pos := v_scan_uescape_pos + 2;
                  ELSIF substr(v_function_source, v_scan_uescape_pos, 2) = '*/' THEN v_scan_comment_depth := v_scan_comment_depth - 1; v_scan_uescape_pos := v_scan_uescape_pos + 2;
                  ELSE v_scan_uescape_pos := v_scan_uescape_pos + 1;
                  END IF;
                END LOOP;
              ELSE EXIT;
              END IF;
            END LOOP;
            IF substr(v_function_source, v_scan_uescape_pos, 1) = ''''
               AND substr(v_function_source, v_scan_uescape_pos + 2, 1) = ''''
               AND substr(v_function_source, v_scan_uescape_pos + 1, 1) !~ '[0-9A-Fa-f+''[:space:]]' THEN
              v_scan_escape_char := substr(v_function_source, v_scan_uescape_pos + 1, 1);
              v_scan_next_pos := v_scan_uescape_pos + 3;
            END IF;
          END IF;
          v_scan_decoded_identifier := '';
          v_scan_decode_pos := 1;
          WHILE v_scan_decode_pos <= length(v_scan_raw_identifier) LOOP
            v_scan_token := substr(v_scan_raw_identifier, v_scan_decode_pos, 1);
            IF v_scan_token <> v_scan_escape_char THEN
              v_scan_decoded_identifier := v_scan_decoded_identifier || v_scan_token;
              v_scan_decode_pos := v_scan_decode_pos + 1;
            ELSIF substr(v_scan_raw_identifier, v_scan_decode_pos + 1, 1) = v_scan_escape_char THEN
              v_scan_decoded_identifier := v_scan_decoded_identifier || v_scan_escape_char;
              v_scan_decode_pos := v_scan_decode_pos + 2;
            ELSIF substr(v_scan_raw_identifier, v_scan_decode_pos + 1, 1) = '+' THEN
              v_scan_hex := substr(v_scan_raw_identifier, v_scan_decode_pos + 2, 6);
              IF v_scan_hex !~ '^[0-9A-Fa-f]{6}$' THEN
                RAISE EXCEPTION 'ddl_guard: malformed Unicode-escaped identifier in %', cmd.object_identity USING ERRCODE = 'check_violation';
              END IF;
              v_scan_codepoint := (('x' || lpad(v_scan_hex, 8, '0'))::bit(32))::integer;
              IF v_scan_codepoint > 1114111 OR v_scan_codepoint BETWEEN 55296 AND 57343 THEN
                RAISE EXCEPTION 'ddl_guard: malformed Unicode-escaped identifier in %', cmd.object_identity USING ERRCODE = 'check_violation';
              END IF;
              v_scan_decoded_identifier := v_scan_decoded_identifier || chr(v_scan_codepoint);
              v_scan_decode_pos := v_scan_decode_pos + 8;
            ELSE
              v_scan_hex := substr(v_scan_raw_identifier, v_scan_decode_pos + 1, 4);
              IF v_scan_hex !~ '^[0-9A-Fa-f]{4}$' THEN
                RAISE EXCEPTION 'ddl_guard: malformed Unicode-escaped identifier in %', cmd.object_identity USING ERRCODE = 'check_violation';
              END IF;
              v_scan_codepoint := (('x' || lpad(v_scan_hex, 8, '0'))::bit(32))::integer;
              IF v_scan_codepoint BETWEEN 55296 AND 56319 THEN
                IF substr(v_scan_raw_identifier, v_scan_decode_pos + 5, 1) <> v_scan_escape_char
                   OR substr(v_scan_raw_identifier, v_scan_decode_pos + 6, 4) !~ '^[0-9A-Fa-f]{4}$' THEN
                  RAISE EXCEPTION 'ddl_guard: malformed Unicode-escaped identifier in %', cmd.object_identity USING ERRCODE = 'check_violation';
                END IF;
                v_scan_next_codepoint := (('x' || lpad(substr(v_scan_raw_identifier, v_scan_decode_pos + 6, 4), 8, '0'))::bit(32))::integer;
                IF v_scan_next_codepoint NOT BETWEEN 56320 AND 57343 THEN
                  RAISE EXCEPTION 'ddl_guard: malformed Unicode-escaped identifier in %', cmd.object_identity USING ERRCODE = 'check_violation';
                END IF;
                v_scan_decoded_identifier := v_scan_decoded_identifier || chr(65536 + (v_scan_codepoint - 55296) * 1024 + v_scan_next_codepoint - 56320);
                v_scan_decode_pos := v_scan_decode_pos + 10;
              ELSIF v_scan_codepoint BETWEEN 56320 AND 57343 THEN
                RAISE EXCEPTION 'ddl_guard: malformed Unicode-escaped identifier in %', cmd.object_identity USING ERRCODE = 'check_violation';
              ELSE
                v_scan_decoded_identifier := v_scan_decoded_identifier || chr(v_scan_codepoint);
                v_scan_decode_pos := v_scan_decode_pos + 5;
              END IF;
            END IF;
          END LOOP;
          v_scan_tokens := array_append(v_scan_tokens, v_scan_decoded_identifier);
          v_scan_pos := v_scan_next_pos;
        ELSIF v_scan_token = '"' THEN
          v_scan_next_pos := v_scan_pos + 1;
          WHILE v_scan_next_pos <= v_scan_len LOOP
            IF substr(v_function_source, v_scan_next_pos, 1) = '"' THEN
              IF substr(v_function_source, v_scan_next_pos + 1, 1) = '"' THEN v_scan_next_pos := v_scan_next_pos + 2; ELSE v_scan_next_pos := v_scan_next_pos + 1; EXIT; END IF;
            ELSE
              v_scan_next_pos := v_scan_next_pos + 1;
            END IF;
          END LOOP;
          v_scan_tokens := array_append(v_scan_tokens, replace(substr(v_function_source, v_scan_pos + 1, v_scan_next_pos - v_scan_pos - 2), '""', '"'));
          v_scan_pos := v_scan_next_pos;
        ELSIF v_scan_token ~ '[A-Za-z_]' THEN
          v_scan_next_pos := v_scan_pos + 1;
          WHILE v_scan_next_pos <= v_scan_len AND substr(v_function_source, v_scan_next_pos, 1) ~ '[A-Za-z_0-9$]' LOOP v_scan_next_pos := v_scan_next_pos + 1; END LOOP;
          v_scan_tokens := array_append(v_scan_tokens, lower(substr(v_function_source, v_scan_pos, v_scan_next_pos - v_scan_pos)));
          v_scan_pos := v_scan_next_pos;
        ELSIF substr(v_function_source, v_scan_pos, 2) = ':=' THEN
          v_scan_tokens := array_append(v_scan_tokens, ':='); v_scan_pos := v_scan_pos + 2;
        ELSE
          v_scan_tokens := array_append(v_scan_tokens, v_scan_token); v_scan_pos := v_scan_pos + 1;
        END IF;
      END LOOP;
      FOR v_scan_index IN 1..GREATEST(cardinality(v_scan_tokens) - 3, 0) LOOP
        IF v_scan_tokens[v_scan_index] = 'new'
           AND v_scan_tokens[v_scan_index + 1] = '.'
           AND v_scan_tokens[v_scan_index + 2] = 'organization_id'
           AND (v_scan_tokens[v_scan_index + 3] = ':='
                OR (v_scan_tokens[v_scan_index + 3] = '='
                    AND (v_scan_index = 1 OR v_scan_tokens[v_scan_index - 1] = ANY (ARRAY[';','begin','then','else','loop'])))) THEN
          v_direct_assignment := true;
          EXIT;
        END IF;
      END LOOP;
      IF v_assignment_target_oid = ANY(c_known_assignment_oids) OR v_direct_assignment THEN
        RAISE EXCEPTION 'ddl_guard: % creates or clones an organization-assignment trigger function', cmd.object_identity
          USING HINT = 'Writers must supply organization_id explicitly. A validation-only trigger may refuse a missing value, but no trigger/function may assign one.',
                ERRCODE = 'check_violation';
    END IF;
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
  v_default_debt_total_count integer;
  v_assignment_debt_count integer;
  v_frozen_assignment_oids oid[];
  v_frozen_assignment_oid_sql text;
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
  SELECT count(*) INTO v_default_debt_total_count
  FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
  WHERE a.attname = 'organization_id' AND NOT a.attisdropped;
  IF v_default_debt_count <> 9 OR v_default_debt_total_count <> 9 THEN
    RAISE EXCEPTION 'dd154: frozen organization-default debt changed (expected 9 exact attrdef rows, found %); re-read live catalog before applying', v_default_debt_count;
  END IF;
  SELECT array_agg(p.oid ORDER BY p.oid), count(DISTINCT p.oid)
    INTO v_frozen_assignment_oids, v_assignment_debt_count
  FROM pg_proc p
  WHERE p.oid = ANY (ARRAY[
    to_regprocedure('ops._stamp_capture_org()'), to_regprocedure('plan._stamp_from_node()'),
    to_regprocedure('platform.inherit_org_from_parent()'), to_regprocedure('platform.stamp_run_org()'),
    to_regprocedure('public._stamp_org_default()'), to_regprocedure('public.dm_default_org()'),
    to_regprocedure('public.files_inherit_org_from_folder()'), to_regprocedure('users._stamp_secret_audit_org()')
  ]);
  IF v_assignment_debt_count <> 8 THEN
    RAISE EXCEPTION 'dd154: frozen organization-assignment function set changed (expected 8 exact functions, found %); re-read live catalog before applying', v_assignment_debt_count;
  END IF;
  SELECT string_agg(oid::text || '::oid', ',' ORDER BY oid) INTO v_frozen_assignment_oid_sql
  FROM unnest(v_frozen_assignment_oids) oid;
  IF position(v_guard_replacement IN v_guard_body) = 0 THEN
    IF regexp_count(v_guard_body, v_guard_marker_pattern) <> 1 THEN
      RAISE EXCEPTION 'dd154: ddl_guard table-only marker is unrecognized; re-read pg_get_functiondef and update this surgical transform';
    END IF;
    v_guard_new := regexp_replace(v_guard_body, v_guard_marker_pattern, v_guard_replacement);
    v_guard_new := replace(v_guard_new,
      '  v_schema text; v_rel text; v_kind "char"; v_ispart boolean;',
      E'  v_schema text; v_rel text; v_kind "char"; v_ispart boolean;\n  c_known_assignment_oids CONSTANT oid[] := ARRAY[$dd154_assignment_oids$];\n  v_assignment_target_oid oid; v_function_source text; v_default_oid oid; v_default_ref text; v_default_md5 text;\n  v_scan_len integer; v_scan_pos integer; v_scan_next_pos integer; v_scan_uescape_pos integer; v_scan_comment_depth integer; v_scan_index integer; v_scan_decode_pos integer; v_scan_token text; v_scan_tokens text[]; v_scan_dollar_delimiter text; v_scan_raw_identifier text; v_scan_decoded_identifier text; v_scan_escape_char text; v_scan_hex text; v_scan_codepoint integer; v_scan_next_codepoint integer; v_standard_conforming_strings boolean; v_direct_assignment boolean;');
    v_guard_new := replace(v_guard_new, '$dd154_assignment_oids$', v_frozen_assignment_oid_sql);
    IF position('c_known_assignment_oids CONSTANT oid[]' IN v_guard_new) = 0
       OR position('$dd154_assignment_oids$' IN v_guard_new) > 0 THEN
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


-- dd154 rollback-only live probes. Append these bytes after DD154 in the same
-- sanctioned ledgered apply transaction. This file deliberately has no
-- BEGIN/COMMIT: every probe opens and rolls back its own nested subtransaction.
-- It creates no persistent object and does not read or alter application rows.

DO $dd154_positive$
DECLARE
  v_rolled_back boolean := false;
BEGIN
  BEGIN
    CREATE TEMP TABLE dd154_probe_positive (organization_id uuid NOT NULL) ON COMMIT DROP;
    CREATE FUNCTION pg_temp.dd154_probe_validate() RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      IF NEW.organization_id IS NULL THEN
        RAISE EXCEPTION 'organization_id is required' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END
    $fn$;
    CREATE TRIGGER dd154_probe_validate BEFORE INSERT ON dd154_probe_positive
      FOR EACH ROW EXECUTE FUNCTION pg_temp.dd154_probe_validate();
    INSERT INTO dd154_probe_positive(organization_id)
      VALUES ('11111111-1111-1111-1111-111111111111'::uuid);
    IF (SELECT count(*) FROM dd154_probe_positive) <> 1 THEN
      RAISE EXCEPTION 'dd154 rollback probe: explicit writer was not persisted in its temporary relation';
    END IF;
    -- This sentinel is intentionally distinct from assertion failures (P0001)
    -- so a broken positive probe cannot catch and bless its own failure.
    RAISE EXCEPTION 'dd154 rollback-only positive probe complete' USING ERRCODE = 'PDD54';
  EXCEPTION WHEN SQLSTATE 'PDD54' THEN
    v_rolled_back := true;
  END;
  IF NOT v_rolled_back OR to_regclass('pg_temp.dd154_probe_positive') IS NOT NULL
     OR to_regprocedure('pg_temp.dd154_probe_validate()') IS NOT NULL THEN
    RAISE EXCEPTION 'dd154 rollback probe: positive temporary objects survived';
  END IF;
END
$dd154_positive$;

DO $dd154_new_default$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    CREATE TEMP TABLE dd154_probe_new_default (
      organization_id uuid NOT NULL DEFAULT gen_random_uuid()
    ) ON COMMIT DROP;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected OR to_regclass('pg_temp.dd154_probe_new_default') IS NOT NULL THEN
    RAISE EXCEPTION 'dd154 rollback probe: new organization default was not rejected with 23514 and rolled back';
  END IF;
END
$dd154_new_default$;

DO $dd154_direct$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    CREATE FUNCTION pg_temp.dd154_probe_direct() RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      NEW.U&"organizat\0069on_id" := gen_random_uuid();
      RETURN NEW;
    END
    $fn$;
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected OR to_regprocedure('pg_temp.dd154_probe_direct()') IS NOT NULL THEN
    RAISE EXCEPTION 'dd154 rollback probe: Unicode direct assignment was not rejected with 23514 and rolled back';
  END IF;
END
$dd154_direct$;

DO $dd154_known_attachment$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    CREATE TEMP TABLE dd154_probe_known_attachment (organization_id uuid NOT NULL) ON COMMIT DROP;
    CREATE TRIGGER dd154_probe_known_attachment BEFORE INSERT ON dd154_probe_known_attachment
      FOR EACH ROW EXECUTE FUNCTION public._stamp_org_default();
  EXCEPTION WHEN SQLSTATE '23514' THEN
    v_rejected := true;
  END;
  IF NOT v_rejected OR to_regclass('pg_temp.dd154_probe_known_attachment') IS NOT NULL THEN
    RAISE EXCEPTION 'dd154 rollback probe: known assignment attachment was not rejected with 23514 and rolled back';
  END IF;
END
$dd154_known_attachment$;

DO $dd154_provisioner$
DECLARE
  v_refused boolean := false;
BEGIN
  BEGIN
    PERFORM platform.create_entity_table(
      'pg_temp', 'dd154_probe_provisioner_true', 'dd154_probe_provisioner_true', 'DD154 rollback probe',
      ARRAY[]::text[], 'entity', false, false, 'none', false, false, true, false, NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_refused := SQLERRM = 'create_entity_table: p_org_default=true is forbidden';
  END;
  IF NOT v_refused OR to_regclass('pg_temp.dd154_probe_provisioner_true') IS NOT NULL THEN
    RAISE EXCEPTION 'dd154 rollback probe: p_org_default=true did not refuse before a relation side effect';
  END IF;
END
$dd154_provisioner$;
