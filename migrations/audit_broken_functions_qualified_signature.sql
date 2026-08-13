-- audit_broken_functions_qualified_signature.sql
--
-- Fixes a data-quality regression introduced by
-- audit_broken_functions_severity_and_search_path.sql on the same day.
--
-- That migration varies `search_path` per function so plpgsql_check resolves
-- names the way the function actually will at runtime. The checker loop's
-- cursor computed the recorded signature as `p.oid::regprocedure::text`, and
-- plpgsql fetches cursor rows lazily — so that cast was evaluated while the
-- search path was pointed at the function under test. `regprocedure` omits the
-- schema for anything reachable on the current search path, so every `public`
-- function landed in audit.broken_functions as `execute_complex_save(jsonb,jsonb)`
-- instead of `public.execute_complex_save(jsonb,jsonb)`, while functions in other
-- schemas stayed qualified. An unqualified signature is ambiguous (two schemas
-- can hold the same name) and breaks grouping and the function-deps drill-down.
--
-- Built explicitly with format('%I.%I(%s)', ...) so the value cannot depend on
-- the search path at all.
--
-- Idempotent. Safe to re-run.

create or replace function audit.refresh_static()
returns text
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
DECLARE
  r record; w record; d record; c record;
  v_relid regclass; v_ext text; v_sql text; v_dep text; v_sp text;
  v_sev text; v_reason text;
BEGIN
  SELECT n.nspname INTO v_ext FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='plpgsql_check';

  TRUNCATE audit.canonical_findings, audit.unregistered_candidates, audit.stale_registry,
           audit.m2m_candidates, audit.broken_functions, audit.function_deps;

  INSERT INTO audit.stale_registry(token,schema_name,table_name)
  SELECT token,schema_name,table_name FROM platform.entity_types et
  WHERE to_regclass(format('%I.%I',et.schema_name,et.table_name)) IS NULL
    AND NOT EXISTS (SELECT 1 FROM meta.audit_exemption ex
                    WHERE ex.check_name='stale_registry' AND ex.schema_name=et.schema_name AND ex.table_name=et.table_name);

  -- Machinery rows (audit_class='machinery') are OUTSIDE the certification universe:
  -- the gate is not run for them; the written reason lives on the registry row.
  FOR r IN SELECT et.token, et.schema_name AS s, et.table_name AS t
           FROM platform.entity_types et
           WHERE et.is_active AND to_regclass(format('%I.%I',et.schema_name,et.table_name)) IS NOT NULL
             AND et.audit_class <> 'machinery'
  LOOP
    BEGIN
      INSERT INTO audit.canonical_findings(schema_name,table_name,token,source,check_name,status,detail)
      SELECT r.s,r.t,r.token,'gate',vc.check_name,vc.status,vc.detail
      FROM iam.verify_canonical(r.s,r.t,r.token) vc
      WHERE vc.status IN ('FAIL','WARN')
        AND NOT EXISTS (SELECT 1 FROM meta.audit_exemption ex
                        WHERE ex.check_name='gate:'||vc.check_name AND ex.schema_name=r.s AND ex.table_name=r.t);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO audit.canonical_findings(schema_name,table_name,token,source,check_name,status,detail)
      VALUES (r.s,r.t,r.token,'gate','gate_error','FAIL',SQLERRM);
    END;
  END LOOP;

  INSERT INTO audit.m2m_candidates(schema_name,table_name,registered,entity_fk_count,fk_targets,payload_cols)
  SELECT n.nspname,c2.relname,
    EXISTS(SELECT 1 FROM platform.entity_types et WHERE et.schema_name=n.nspname AND et.table_name=c2.relname),
    count(*) FILTER (WHERE confrel.relname NOT IN ('organizations','users')),
    string_agg(DISTINCT confrel.relname,', ') FILTER (WHERE confrel.relname NOT IN ('organizations','users')),
    (SELECT count(*) FROM information_schema.columns col WHERE col.table_schema=n.nspname AND col.table_name=c2.relname
       AND col.column_name NOT IN ('id','created_at','updated_at','created_by','updated_by','deleted_at','version','metadata','organization_id','role','label','position','sort_order','sort_index'))
  FROM pg_constraint con JOIN pg_class c2 ON c2.oid=con.conrelid JOIN pg_namespace n ON n.oid=c2.relnamespace
  JOIN pg_class confrel ON confrel.oid=con.confrelid
  WHERE con.contype='f' AND n.nspname NOT IN (SELECT schema_name FROM meta.excluded_schema) AND n.nspname<>'audit'
    AND NOT EXISTS (SELECT 1 FROM meta.audit_exemption ex
                    WHERE ex.check_name='m2m_candidate' AND ex.schema_name=n.nspname AND ex.table_name=c2.relname)
  GROUP BY n.nspname,c2.relname
  HAVING count(*) FILTER (WHERE confrel.relname NOT IN ('organizations','users')) >= 2
     AND audit.is_m2m_shape(format('%I.%I',n.nspname,c2.relname)::regclass);

  INSERT INTO audit.unregistered_candidates(schema_name,table_name,base_col_score,has_id_uuid,has_created_at)
  SELECT n.nspname,c2.relname,
    (SELECT count(*) FROM information_schema.columns col WHERE col.table_schema=n.nspname AND col.table_name=c2.relname
       AND col.column_name IN ('id','organization_id','created_by','updated_by','created_at','updated_at','deleted_at','version','metadata')),
    EXISTS(SELECT 1 FROM information_schema.columns col WHERE col.table_schema=n.nspname AND col.table_name=c2.relname AND col.column_name='id' AND col.data_type='uuid'),
    EXISTS(SELECT 1 FROM information_schema.columns col WHERE col.table_schema=n.nspname AND col.table_name=c2.relname AND col.column_name='created_at')
  FROM pg_class c2 JOIN pg_namespace n ON n.oid=c2.relnamespace
  WHERE c2.relkind='r' AND n.nspname NOT IN (SELECT schema_name FROM meta.excluded_schema) AND n.nspname<>'audit'
    AND c2.relname NOT LIKE '\_%'
    AND NOT EXISTS(SELECT 1 FROM platform.entity_types et WHERE et.schema_name=n.nspname AND et.table_name=c2.relname)
    AND NOT EXISTS (SELECT 1 FROM meta.audit_exemption ex
                    WHERE ex.check_name='unregistered_candidate' AND ex.schema_name=n.nspname AND ex.table_name=c2.relname);

  -- ── plpgsql_check, run under each function's OWN effective search path ──
  -- `sig` is built with format(), never `oid::regprocedure::text`: this loop
  -- changes search_path per iteration and plpgsql fetches cursor rows lazily,
  -- so a regprocedure cast here would silently drop the schema qualifier for
  -- every function reachable on the path under test.
  FOR r IN SELECT p.oid, n.nspname AS s, p.proname AS fn,
                  format('%I.%I(%s)', n.nspname, p.proname,
                         pg_get_function_identity_arguments(p.oid)) AS sig,
                  p.prorettype AS rettype, p.proconfig
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
             AND n.nspname NOT IN (SELECT schema_name FROM meta.excluded_schema) AND n.nspname<>'audit'
  LOOP
    IF r.rettype='pg_catalog.trigger'::regtype THEN
      SELECT tg.tgrelid INTO v_relid FROM pg_trigger tg WHERE tg.tgfoid=r.oid AND NOT tg.tgisinternal LIMIT 1;
      IF v_relid IS NULL THEN
        INSERT INTO audit.broken_functions(schema_name,function_name,signature,level,message,severity)
        VALUES (r.s,r.fn,r.sig,'check_skipped','trigger fn not attached; not checkable','unchecked'); CONTINUE;
      END IF;
    ELSE v_relid:=0; END IF;

    -- THE FIX for the entire "does not exist" false-positive class: resolve
    -- names the way the function itself will at runtime, not under pg_catalog.
    v_sp := audit.effective_search_path(r.proconfig);
    BEGIN
      EXECUTE format('set search_path to %s', v_sp);
    EXCEPTION WHEN OTHERS THEN
      v_sp := 'pg_temp, "$user", public, extensions';
      EXECUTE format('set search_path to %s', v_sp);
    END;

    v_sql := format('SELECT lineno,level,sqlstate,message,statement,context FROM %I.plpgsql_check_function_tb($1,$2,false)',v_ext);
    BEGIN
      FOR w IN EXECUTE v_sql USING r.oid::regprocedure, v_relid LOOP
        IF w.level IN ('error','warning') THEN
          SELECT cb.severity, cb.suppression_reason INTO v_sev, v_reason
          FROM audit.classify_broken_function(r.oid, w.level, w.sqlstate, w.message) cb;
          INSERT INTO audit.broken_functions(schema_name,function_name,signature,lineno,level,sqlstate,message,context,severity,suppression_reason)
          VALUES (r.s,r.fn,r.sig,w.lineno,w.level,w.sqlstate,w.message,w.context,v_sev,v_reason);
        END IF;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO audit.broken_functions(schema_name,function_name,signature,level,sqlstate,message,severity)
      VALUES (r.s,r.fn,r.sig,'check_skipped',SQLSTATE,SQLERRM,'unchecked');
    END;

    v_dep := format('SELECT type,schema,name FROM %I.plpgsql_show_dependency_tb($1,$2)',v_ext);
    BEGIN
      FOR d IN EXECUTE v_dep USING r.oid::regprocedure, v_relid LOOP
        INSERT INTO audit.function_deps(function_schema,function_name,signature,dep_type,dep_schema,dep_name)
        VALUES (r.s,r.fn,r.sig,d.type,d.schema,d.name);
      END LOOP;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  SET search_path TO 'pg_catalog';

  -- ── The privilege class: invoker-rights functions that enumerate relations
  --    from the catalog and query them with no privilege filter. Static SHAPE,
  --    not proven breakage — hence severity='advisory'. This is the closest a
  --    static checker can get to the get_project_references failure
  --    ("permission denied for schema graveyard"), which was a runtime
  --    privilege error inside dynamic SQL and therefore unfindable statically.
  FOR c IN
    SELECT p.oid, n.nspname AS s, p.proname AS fn,
           format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid)) AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
      AND p.prokind='f' AND NOT p.prosecdef
      AND n.nspname NOT IN (SELECT schema_name FROM meta.excluded_schema) AND n.nspname<>'audit'
      AND pg_get_functiondef(p.oid) ~* 'execute\s+(format|''|")'
      AND pg_get_functiondef(p.oid) ~* '(from|join)\s+pg_class|information_schema\.tables|from\s+pg_constraint'
      AND pg_get_functiondef(p.oid) !~* 'has_(table|schema)_privilege'
  LOOP
    INSERT INTO audit.broken_functions(schema_name,function_name,signature,level,message,severity,context)
    VALUES (c.s,c.fn,c.sig,'privilege_risk',
            'Invoker-rights function enumerates relations from the catalog and builds dynamic SQL against them without has_table_privilege/has_schema_privilege — it will fail for any caller who cannot read a discovered table.',
            'advisory',
            'Fix pattern: public.get_project_references (2026-08-13). Prove it with a row in audit.function_runtime_probe.');
  END LOOP;

  INSERT INTO audit.refresh_log(gate_fail,gate_warn,ext_fail,ext_warn,m2m,unregistered,stale,broken_fn,note)
  SELECT
    (SELECT count(*) FROM audit.canonical_findings WHERE status='FAIL'),
    (SELECT count(*) FROM audit.canonical_findings WHERE status='WARN'),
    0,0,
    (SELECT count(*) FROM audit.m2m_candidates),
    (SELECT count(*) FROM audit.unregistered_candidates),
    (SELECT count(*) FROM audit.stale_registry),
    (SELECT count(DISTINCT signature) FROM audit.broken_functions WHERE severity='real'),
    'complete gate; deps='||(SELECT count(*) FROM audit.function_deps)::text||'; exemptions='||(SELECT count(*) FROM meta.audit_exemption)::text
      ||'; machinery='||(SELECT count(*) FROM platform.entity_types WHERE is_active AND audit_class='machinery')::text;

  PERFORM audit.refresh_log_recount();
  RETURN 'audit.refresh complete';
END; $fn$;

select audit.refresh();

do $assert$
declare v_unqualified integer;
begin
  select count(*) into v_unqualified from audit.broken_functions where signature not like '%.%(%';
  if v_unqualified > 0 then
    raise exception 'audit.broken_functions holds % unqualified signature(s) — the schema qualifier was dropped again.', v_unqualified;
  end if;
  select count(*) into v_unqualified from audit.function_deps where signature not like '%.%(%';
  if v_unqualified > 0 then
    raise exception 'audit.function_deps holds % unqualified signature(s).', v_unqualified;
  end if;
end $assert$;
