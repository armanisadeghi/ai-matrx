-- chair-step: this drops the nine custom registry mirrors, narrows relation_kind back to two values and restores a GLOBAL unique constraint — three shapes no additive judgement admits
-- based-on: iam.apply_rls(text, text, text, text) 817893fc4f5a256cd6368e78b793bb4f86adad2b8b75b2fb435ca0692465350b
-- based-on: iam.canonical_certify_ok(text, text, text) 8b25b9db052c9f041e0dad7f539056341c19990976a5367e52618152b308d2ac
-- based-on: iam.sweep_governance_guards(text) 07e48fbda0f8fc151bc6ccd3324834c6cde4b68d6ac6edbf2a79d9c68fd5d14f
-- based-on: audit.refresh_static() 5870b6d3c7c6b000ca3cdc93e466c3fd5e0fc153dc2aa9274529f2234a7d1861
--
-- THE INVERSE of `migrations/campaign/w1_reg_virtual_tokens_and_the_partial_index.sql`.
-- Header-less on purpose (§4.9).
--
--     pnpm db:apply migrations/inverse/w1_reg_virtual_tokens_and_the_partial_index_down.sql --target branch
--
-- ORDER MATTERS AND THE FILE ENFORCES IT: the virtual rows come out FIRST, because the
-- global unique constraint this file restores is exactly what nine rows on one relation
-- cannot satisfy. It refuses, naming them, rather than letting Postgres report it as a
-- duplicate-key error on a constraint nobody was looking at.
--
-- The four function bodies are restored VERBATIM from `pg_get_functiondef` as they stood
-- at 2026-09-18 00:22 UTC, before the up-file ran.
--
-- 🚨 THE `-- based-on:` HASHES ABOVE WERE NOT PRODUCED BY `pnpm db:based-on`, AND COULD NOT BE.
-- That script opens the DEFAULT connection, which is PRODUCTION — it takes no `--target` and
-- has no way to read the rehearsal branch (`scripts/db-based-on.ts`). For a branch-only file
-- replacing a body that now DIFFERS on the branch, it therefore prints production's hash and
-- the runner refuses the file against the branch's real one. Measured 2026-09-18 00:26:
-- `db:based-on iam.apply_rls` printed `a9bd3e3c…` while the branch held `817893fc…`.
-- These four were computed against the BRANCH:
--     select encode(sha256(convert_to(pg_get_functiondef('<fn>'::regprocedure),'UTF8')),'hex');
-- which is byte-for-byte what the runner compares. Reported as FOUND OUTSIDE BRIEF.

set lock_timeout = '2s';
set statement_timeout = '600s';

delete from platform.entity_types where relation_kind = 'virtual';

do $$
declare n integer; v text;
begin
  select count(*), string_agg(schema_name||'.'||table_name||' x'||c::text, ', ')
    into n, v
  from (select schema_name, table_name, count(*) c from platform.entity_types
         group by schema_name, table_name having count(*) > 1) d;
  if n > 0 then
    raise exception
      'W1-REG inverse: % (schema, table) pair(s) still hold more than one row — the global unique constraint cannot come back: %', n, v
      using hint = 'Something other than this lane minted a duplicate pair. Remove it before restoring entity_types_schema_name_table_name_key.';
  end if;
end $$;

alter table platform.entity_types
  add constraint entity_types_schema_name_table_name_key unique (schema_name, table_name);

drop index if exists platform.entity_types_schema_table_nonvirtual_uk;

do $$
begin
  if exists (select 1 from pg_constraint where conrelid='platform.entity_types'::regclass
               and conname='entity_types_relation_kind_valid'
               and pg_get_constraintdef(oid) like '%virtual%') then
    alter table platform.entity_types drop constraint entity_types_relation_kind_valid;
    alter table platform.entity_types add constraint entity_types_relation_kind_valid
      check (relation_kind = any (array['table'::text, 'projection'::text]));
  end if;
end $$;

-- the four bodies, as they stood before the up-file
CREATE OR REPLACE FUNCTION iam.apply_rls(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_registered_schema text;
  v_registered_table text;
  v_audit_class text;
  -- DD-147 drift guard: what the table carried before the emit, and what appeared that this
  -- generator does not claim to author.
  v_tbl regclass;
  v_before text[];
  v_stray text[];
  -- DD-249: how many rows say `public` on a table whose class grants no anon lane.
  v_public_rows bigint;
BEGIN
  SELECT et.schema_name, et.table_name, coalesce(et.audit_class, 'entity')
    INTO v_registered_schema, v_registered_table, v_audit_class
  FROM platform.entity_types AS et
  WHERE et.token = p_token
    AND et.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'apply_rls: token % is not an active registered entity', p_token;
  END IF;

  IF v_registered_schema IS DISTINCT FROM p_schema
     OR v_registered_table IS DISTINCT FROM p_table THEN
    RAISE EXCEPTION
      'apply_rls: token % maps to %.%, not %.%',
      p_token, v_registered_schema, v_registered_table, p_schema, p_table;
  END IF;

  IF v_audit_class = 'machinery' THEN
    RAISE EXCEPTION
      'apply_rls: token % (%.%) is access machinery; generic RLS is forbidden because machinery owns inputs consumed by the access resolver',
      p_token, p_schema, p_table;
  END IF;

  -- 🚨 DD-137b (VISIBILITY-BY-CLASS §3.1, chair R3). AN UNSET CLASS IS NOT A VALUE, IT IS A
  -- REFUSAL. Generation is the one place in this system that CAN refuse safely: nobody is
  -- denied their own data by a generation that does not run. The runtime half — the kernel —
  -- resolves unset to `private` instead, because refusing there WOULD deny somebody.
  IF p_variant NOT IN ('component','ledger') AND NOT EXISTS (
       SELECT 1 FROM platform.entity_types et
        WHERE et.token = p_token AND et.data_class IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23502',
      MESSAGE = format('apply_rls: token %s (%s.%s) has no data_class. Which access lanes this table emits is decided by its class, and nobody has decided it.', p_token, p_schema, p_table),
      HINT = 'Set platform.entity_types.data_class (private | confidential | organization | public) with a data_class_reason, then re-run. An unset class is not defaulted to anything: a default here would silently widen a live table.';
  END IF;

  -- 🚨 DD-249 (2026-09-15) — A PUBLIC ROW AND A CLASS WITH NO ANON LANE IS A CONTRADICTION,
  -- AND THE GENERATOR IS WHERE IT GETS SETTLED.
  -- The emit above no longer builds `pub_read` for a class whose lane set has no anon lane.
  -- That alone would be a silent narrowing on a table that is genuinely serving anonymous
  -- readers today: 25 live tokens hold rows marked `visibility = 'public'` under a class that
  -- says no stranger may read them, and `app.definition` (81 such rows) is read by an
  -- anonymous visitor on every /p/<slug> page load. Dropping their lane quietly would take a
  -- working product surface away; keeping it quietly would leave the class lying about the
  -- table. So generation REFUSES and names both exits — DD-137b's rule, one layer out: nobody
  -- is denied their own data by a generation that does not run.
  IF p_variant NOT IN ('component','ledger','personal','system') AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = p_schema AND table_name = p_table AND column_name = 'visibility')
     AND NOT (iam.class_lanes(p_token)).anon_lane THEN
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE visibility = ''public''', p_schema, p_table)
      INTO v_public_rows;
    IF v_public_rows > 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = format(
          'apply_rls: %s.%s (token %s) holds %s row(s) marked visibility = ''public'', but its class %s emits NO anonymous lane. An anonymous reader is either welcome on this table or not, and right now the data says yes while the class says no. Nothing was generated.',
          p_schema, p_table, p_token, v_public_rows, (iam.class_lanes(p_token)).resolved_class),
        HINT = 'Two legal fixes, and only two. (1) The table really is public-facing: set platform.entity_types.data_class = ''public'' with a data_class_reason saying which anonymous surface serves it, then re-run — `public` is the one class whose lane set includes anon. (2) The rows are not meant to be world-readable: move them off ''public'' (UPDATE ... SET visibility = ''internal''), then re-run and the anon lane goes away with them. Hand-writing a pub_read policy beside this generator is not a third option; iam.apply_rls drops it on the next run.';
    END IF;
  END IF;

  -- 🚨 DD-147 (2026-09-12) — THE DRIFT GUARD OVER THE CATALOG.
  -- `iam._apply_rls_unchecked` now drops only the names in `iam.generated_policy_names()` and KEEPS
  -- everything else. That makes the catalog load-bearing: an eighth emitted name that nobody added
  -- to it would look bespoke, survive its own regeneration, and be preserved forever by the very
  -- function that wrote it. So the catalog is not trusted, it is CHECKED — on every single run,
  -- against what the emit actually produced. A policy that is new AND outside the catalog is a
  -- generator whose catalog is a lie, and this refuses to leave one behind quietly.
  v_tbl := to_regclass(format('%I.%I', p_schema, p_table));
  IF v_tbl IS NULL THEN
    RAISE EXCEPTION 'apply_rls: %.% does not exist', p_schema, p_table;
  END IF;
  SELECT coalesce(array_agg(polname ORDER BY polname), '{}') INTO v_before
    FROM pg_policy WHERE polrelid = v_tbl;

  PERFORM iam._apply_rls_unchecked(p_schema, p_table, p_token, p_variant);

  SELECT coalesce(array_agg(polname ORDER BY polname), '{}') INTO v_stray
    FROM pg_policy
   WHERE polrelid = v_tbl
     AND NOT (polname = ANY (iam.generated_policy_names()))
     AND NOT (polname = ANY (v_before));
  IF cardinality(v_stray) > 0 THEN
    RAISE EXCEPTION
      'apply_rls: the generation of %.% (token %) created policy/policies % that are NOT in iam.generated_policy_names(). The catalog is what tells regeneration which policies are ours to drop, so a name outside it would be treated as bespoke and preserved for ever by the function that wrote it. Add the name to iam.generated_policy_names() in the same change that emits it.',
      p_schema, p_table, p_token, array_to_string(v_stray, ', ');
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION iam.canonical_certify_ok(p_schema text, p_table text, p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT NOT EXISTS(
    SELECT 1 FROM iam.canonical_certify(p_schema,p_table,p_token) cc
    WHERE cc.status <> 'INFO'
  );
$function$;

CREATE OR REPLACE PROCEDURE iam.sweep_governance_guards(IN p_lock_timeout text DEFAULT '3s'::text)
 LANGUAGE plpgsql
AS $procedure$
declare
  r record;
  v_applied int := 0;
  v_dropped int := 0;
begin
  -- No EXCEPTION block here on purpose: plpgsql forbids transaction control
  -- inside one, and per-table COMMIT is the whole point. If a table cannot be
  -- locked within p_lock_timeout the procedure aborts LOUDLY naming that table;
  -- everything already committed stays, and re-running resumes where it stopped
  -- (the loop skips tables already in the desired state).
  execute format('set lock_timeout = %L', p_lock_timeout);

  for r in
    select et.schema_name, et.table_name, et.token, coalesce(et.rls_variant, 'entity') as variant,
           exists (
             select 1 from pg_trigger tg
             where tg.tgrelid = format('%I.%I', et.schema_name, et.table_name)::regclass
               and tg.tgname = '_guard_governance'
               and not tg.tgisinternal) as has_guard
    from platform.entity_types et
    where et.is_active
      and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
      and exists (
        select 1 from pg_policies p
        where p.schemaname = et.schema_name
          and p.tablename  = et.table_name
          and p.policyname = 'std_update')
    order by et.schema_name, et.table_name
  loop
    if r.variant in ('entity', 'system') then
      if not r.has_guard then
        perform iam.apply_governance_guard(r.schema_name, r.table_name, r.token);
        v_applied := v_applied + 1;
        commit;
      end if;
    elsif r.has_guard then
      perform iam.drop_governance_guard(r.schema_name, r.table_name);
      v_dropped := v_dropped + 1;
      commit;
    end if;
  end loop;

  raise notice 'governance guard sweep: attached %, cleared % (tables already correct were skipped)',
    v_applied, v_dropped;
end
$procedure$;

CREATE OR REPLACE FUNCTION audit.refresh_static()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  r record; w record; d record; c record;
  v_relid regclass; v_ext text; v_sql text; v_dep text; v_sp text; v_sig text;
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
  FOR r IN SELECT p.oid, n.nspname AS s, p.proname AS fn,
                  p.prorettype AS rettype, p.proconfig
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
             AND n.nspname NOT IN (SELECT schema_name FROM meta.excluded_schema) AND n.nspname<>'audit'
  LOOP
    -- The signature is a JOIN KEY (audit.table_impact matches it against
    -- (oid::regprocedure)::text). Evaluate the cast here, with the path pinned
    -- to pg_catalog, so it is always schema-qualified AND byte-identical to
    -- what table_impact computes. Never compute it in the cursor's select list:
    -- plpgsql fetches lazily and this loop rewrites search_path per iteration.
    SET search_path TO 'pg_catalog';
    v_sig := (r.oid::regprocedure)::text;

    IF r.rettype='pg_catalog.trigger'::regtype THEN
      SELECT tg.tgrelid INTO v_relid FROM pg_trigger tg WHERE tg.tgfoid=r.oid AND NOT tg.tgisinternal LIMIT 1;
      IF v_relid IS NULL THEN
        INSERT INTO audit.broken_functions(schema_name,function_name,signature,level,message,severity)
        VALUES (r.s,r.fn,v_sig,'check_skipped','trigger fn not attached; not checkable','unchecked'); CONTINUE;
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
          VALUES (r.s,r.fn,v_sig,w.lineno,w.level,w.sqlstate,w.message,w.context,v_sev,v_reason);
        END IF;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO audit.broken_functions(schema_name,function_name,signature,level,sqlstate,message,severity)
      VALUES (r.s,r.fn,v_sig,'check_skipped',SQLSTATE,SQLERRM,'unchecked');
    END;

    v_dep := format('SELECT type,schema,name FROM %I.plpgsql_show_dependency_tb($1,$2)',v_ext);
    BEGIN
      FOR d IN EXECUTE v_dep USING r.oid::regprocedure, v_relid LOOP
        INSERT INTO audit.function_deps(function_schema,function_name,signature,dep_type,dep_schema,dep_name)
        VALUES (r.s,r.fn,v_sig,d.type,d.schema,d.name);
      END LOOP;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    SET search_path TO 'pg_catalog';
  END LOOP;

  SET search_path TO 'pg_catalog';

  -- ── The privilege class: invoker-rights functions that enumerate relations
  --    from the catalog and query them with no privilege filter. Static SHAPE,
  --    not proven breakage — hence severity='advisory'. This is the closest a
  --    static checker can get to the get_project_references failure
  --    ("permission denied for schema graveyard"), which was a runtime
  --    privilege error inside dynamic SQL and therefore unfindable statically.
  FOR c IN
    SELECT p.oid, n.nspname AS s, p.proname AS fn, (p.oid::regprocedure)::text AS sig
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
END; $function$;

do $$
declare n_virtual int; n_idx int; n_uk int;
begin
  select count(*) into n_virtual from platform.entity_types where relation_kind = 'virtual';
  select count(*) into n_idx from pg_class where relname = 'entity_types_schema_table_nonvirtual_uk';
  select count(*) into n_uk from pg_constraint where conrelid='platform.entity_types'::regclass
     and conname='entity_types_schema_name_table_name_key';
  if n_virtual <> 0 or n_idx <> 0 or n_uk <> 1 then
    raise exception 'W1-REG inverse incomplete: % virtual row(s), % partial index/es, % global unique constraint(s)',
      n_virtual, n_idx, n_uk;
  end if;
  if pg_get_functiondef('iam.apply_rls(text,text,text,text)'::regprocedure) like '%relation_kind = ''virtual''%' then
    raise exception 'W1-REG inverse: iam.apply_rls still carries the REC-58 arm';
  end if;
  raise notice 'W1-REG inverse: no virtual rows, the global unique constraint is back, relation_kind is two values again, and the four bodies are as they were.';
end $$;
