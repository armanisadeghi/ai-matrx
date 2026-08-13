-- audit_broken_functions_severity_and_search_path.sql
--
-- Make the plpgsql conformance checker trustworthy. Two defects, both measured
-- live on 2026-08-13 against project txzxabzwovsujtloxrus.
--
-- DEFECT 1 — the counts disagreed. `audit.refresh_log.broken_fn` was
-- `count(DISTINCT signature) WHERE level='error'` (29) while
-- `audit.broken_functions` held 101 rows (40 error + 39 warning + 22
-- check_skipped). Neither number was wrong; they measured different things and
-- the admin surface showed both side by side with no way to tell. On top of
-- that, `audit.run_function_runtime_probes()` inserts its failures AFTER
-- `refresh_static()` has already written the log row, so a runtime probe
-- failure could never appear in any count at all.
--   Fix: the log row carries one explicit column per severity, and
--   `audit.refresh()` recomputes every one of them FROM THE TABLE after both
--   phases have run (`audit.refresh_log_recount()`). The log can no longer
--   drift from the table by construction.
--
-- DEFECT 2 — ~2/3 of the error rows were checker artifacts, and the noise is
-- what let two real bugs hide. Root cause: `audit.refresh_static()` runs with
-- `SET search_path TO 'pg_catalog'`, so plpgsql_check resolved every
-- unqualified name in every function under a search path no function ever
-- actually runs with. Every one of these objects EXISTS:
--   public.guest_executions, public.is_system_path(text), public.get_user_limits,
--   public.calculate_trending_score, public.get_version_snapshot,
--   public.promote_version, public.hard_delete_file, public.org_role,
--   public.context_value_type, public.operation_record,
--   extensions.gen_random_bytes(int)
-- ...and every one was reported "does not exist". Correcting the search path
-- alone took the error set from 40 rows / 29 signatures to 23 rows / 12
-- signatures, AND unmasked two real bugs the noise had been hiding
-- (public.execute_complex_save: "cannot cast type jsonb to text[]" +
-- "invalid transaction termination", previously buried under a bogus
-- "type operation_record[] does not exist").
--
-- Three checker limitations remain that no search path can fix, so each row is
-- now classified with a written reason instead of being reported as breakage:
--   * a temp table the function CREATEs itself (plpgsql_check runs before the
--     CREATE, so `_assoc_orphan_ids` / `_import_rows` cannot exist yet);
--   * a relation name the function builds at runtime from a text[] (the
--     checker reads the array literal as a relation name — hence the
--     un-openable `education.{study_session,study_attempt,...}`);
--   * a SHARED trigger function branching on the table it fired for. Verified
--     mechanically, not by message matching: the finding is suppressed only
--     when the function is attached to MORE THAN ONE table and at least one
--     attached table actually has the field. A trigger attached to one table
--     that lacks the field, or attached to several none of which have it, stays
--     a real error.
--
-- SEVERITY is the column the admin UI defaults on:
--   real       — genuine runtime breakage. Act on these.
--   advisory   — the privilege-filter class (see below). Not proven broken.
--   style      — plpgsql_check warnings: unused variable, IMMUTABLE-vs-STABLE,
--                "target type is different type than source type". Never a
--                runtime failure.
--   suppressed — explained by a checker limitation; `suppression_reason` says
--                which. Kept visible, never counted as breakage.
--   unchecked  — a trigger function attached to no table; nothing to check
--                against.
--
-- NEVER-SUPPRESS floor: a fixed list of sqlstates can only ever be `real`, no
-- matter what other rule matches. It exists because of the two genuine findings
-- this tooling did surface (both fixed 2026-08-13): admin_configure_entity_access
-- and admin_set_containment_edge each upserted ON CONFLICT (child_type,
-- parent_type, kind) against a table whose only unique key is (child_type,
-- parent_type, fk_column) — a hard 42P10 for any admin configuring containment.
-- They are clean now, so they correctly no longer appear; 42P10 is pinned to
-- `real` so a reintroduction cannot be classified away. The migration asserts
-- this at the end and RAISEs if the floor ever stops holding.
--
-- THE PRIVILEGE CLASS — the bug that started this could not have been caught
-- statically at all. `public.get_project_references` failed with "permission
-- denied for schema graveyard": a runtime privilege error inside dynamic SQL,
-- invisible to any checker. The cheap flag added here is the shape, not the
-- error: an INVOKER-rights plpgsql function that enumerates relations from the
-- catalog (pg_class / pg_constraint / information_schema.tables), builds
-- dynamic SQL, and never calls has_table_privilege / has_schema_privilege. It
-- will break for any caller who cannot read one of the tables it discovers.
-- Emitted as level='privilege_risk', severity='advisory' — 9 rows live, all of
-- them the legacy fetch_*/update_by_id entity-system family. Confirmed
-- breakage still belongs in `audit.function_runtime_probe`, which is the only
-- thing that can actually prove a runtime privilege failure.
--
-- Idempotent. Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Schema: severity on the findings, per-severity counts on the log
-- ─────────────────────────────────────────────────────────────────────────────

alter table audit.broken_functions
  add column if not exists severity text,
  add column if not exists suppression_reason text;

alter table audit.refresh_log
  add column if not exists broken_fn_rows integer,
  add column if not exists broken_fn_real integer,
  add column if not exists broken_fn_advisory integer,
  add column if not exists broken_fn_style integer,
  add column if not exists broken_fn_suppressed integer,
  add column if not exists broken_fn_unchecked integer,
  add column if not exists runtime_fail integer;

comment on column audit.broken_functions.severity is
  'real | advisory | style | suppressed | unchecked. The admin surface defaults to real. See audit.classify_broken_function().';
comment on column audit.broken_functions.suppression_reason is
  'Why a checker artifact is not breakage: self_created_temp_table | runtime_built_relation_name | shared_trigger_branch.';
comment on column audit.refresh_log.broken_fn is
  'DISTINCT function signatures with severity=real — the actionable number. Recomputed from audit.broken_functions by audit.refresh_log_recount() after every phase, so it can never disagree with the table.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The classifier — one function, so the UI, the log and any ad-hoc query
--    can never apply three different definitions of "real".
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function audit.classify_broken_function(
  p_func_oid   oid,
  p_level      text,
  p_sqlstate   text,
  p_message    text
) returns table (severity text, suppression_reason text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_def          text;
  v_missing_rel  text;
  v_field        text;
  v_attachments  integer;
  v_with_field   integer;
begin
  -- Floor first: these sqlstates are always real breakage. 42P10 is pinned here
  -- because of the admin_configure_entity_access / admin_set_containment_edge
  -- ON CONFLICT bugs — a reintroduction must never be classified away.
  if p_sqlstate in ('42P10', '42803', '42804', '42846', '2D000') then
    return query select 'real'::text, null::text; return;
  end if;

  if p_level = 'check_skipped' then
    return query select 'unchecked'::text, null::text; return;
  end if;

  if p_level = 'privilege_risk' then
    return query select 'advisory'::text, null::text; return;
  end if;

  -- plpgsql_check warnings are style/perf advice, never a runtime failure.
  if p_level = 'warning' then
    return query select 'style'::text, null::text; return;
  end if;

  if p_level not in ('error', 'runtime_error') then
    return query select 'real'::text, null::text; return;
  end if;

  -- A registered runtime probe actually executed and actually failed.
  if p_level = 'runtime_error' then
    return query select 'real'::text, null::text; return;
  end if;

  -- ── relation "X" does not exist ────────────────────────────────────────
  v_missing_rel := (regexp_match(coalesce(p_message, ''), 'relation "([^"]+)" does not exist'))[1];
  if v_missing_rel is not null then
    -- (a) built at runtime: an array literal or a format placeholder read as a name
    if v_missing_rel ~ '[{},%$]' then
      return query select 'suppressed'::text, 'runtime_built_relation_name'::text; return;
    end if;

    -- (b) a temp table this very function creates
    v_def := pg_get_functiondef(p_func_oid);
    if exists (
      select 1
      from regexp_matches(
             v_def,
             'create\s+(?:temp|temporary)\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)',
             'gi') m
      where lower(m[1]) = lower(split_part(v_missing_rel, '.', greatest(1, array_length(string_to_array(v_missing_rel, '.'), 1))))
    ) then
      return query select 'suppressed'::text, 'self_created_temp_table'::text; return;
    end if;

    return query select 'real'::text, null::text; return;
  end if;

  -- ── record "new"/"old" has no field "X" ───────────────────────────────
  v_field := (regexp_match(coalesce(p_message, ''), 'record "(?:new|old)" has no field "([^"]+)"'))[1];
  if v_field is not null then
    select count(distinct tg.tgrelid),
           count(distinct tg.tgrelid) filter (
             where exists (
               select 1 from pg_attribute a
               where a.attrelid = tg.tgrelid and a.attname = v_field
                 and a.attnum > 0 and not a.attisdropped))
      into v_attachments, v_with_field
      from pg_trigger tg
      where tg.tgfoid = p_func_oid and not tg.tgisinternal;

    -- Shared trigger branching on the table it fired for: several attachments,
    -- and the field genuinely exists on at least one of them. A single-table
    -- trigger, or one where NO attached table has the field, stays real.
    if coalesce(v_attachments, 0) > 1 and coalesce(v_with_field, 0) > 0 then
      return query select 'suppressed'::text, 'shared_trigger_branch'::text; return;
    end if;

    return query select 'real'::text, null::text; return;
  end if;

  return query select 'real'::text, null::text;
end;
$fn$;

comment on function audit.classify_broken_function(oid, text, text, text) is
  'THE single definition of finding severity. Never reimplement it in a query or in the admin UI.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The effective search path a function actually runs with
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function audit.effective_search_path(p_proconfig text[])
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- pg_temp is prepended in every case so a self-created temp table is a
  -- resolvable name rather than a phantom missing relation.
  select case
    when sp is null then 'pg_temp, "$user", public, extensions'   -- runtime default (pg_roles.postgres)
    when btrim(sp) in ('', '""') then 'pg_temp, pg_catalog'       -- hardened SECURITY DEFINER: body is fully qualified
    else 'pg_temp, ' || sp
  end
  from (
    select (select substring(cfg from '^search_path=(.*)$')
            from unnest(coalesce(p_proconfig, '{}'::text[])) cfg
            where cfg like 'search_path=%' limit 1) as sp
  ) s;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Recount — the log row is DERIVED from the table, never asserted
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function audit.refresh_log_recount()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare v_run timestamptz;
begin
  select max(run_at) into v_run from audit.refresh_log;
  if v_run is null then return; end if;

  update audit.refresh_log l set
    broken_fn            = (select count(distinct signature) from audit.broken_functions where severity = 'real'),
    broken_fn_rows       = (select count(*) from audit.broken_functions),
    broken_fn_real       = (select count(*) from audit.broken_functions where severity = 'real'),
    broken_fn_advisory   = (select count(*) from audit.broken_functions where severity = 'advisory'),
    broken_fn_style      = (select count(*) from audit.broken_functions where severity = 'style'),
    broken_fn_suppressed = (select count(*) from audit.broken_functions where severity = 'suppressed'),
    broken_fn_unchecked  = (select count(*) from audit.broken_functions where severity = 'unchecked'),
    runtime_fail         = (select count(*) from audit.broken_functions where level = 'runtime_error')
  where l.run_at = v_run;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. refresh_static — same gate/m2m/registry work, corrected function checker
-- ─────────────────────────────────────────────────────────────────────────────

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
  FOR r IN SELECT p.oid, n.nspname AS s, p.proname AS fn, p.oid::regprocedure::text AS sig,
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
    SELECT p.oid, n.nspname AS s, p.proname AS fn, p.oid::regprocedure::text AS sig
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. refresh() — recount AFTER the runtime probes, which run last
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function audit.refresh()
returns text
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare v_note text; v_runtime_failures integer;
begin
  v_note := audit.refresh_static();
  v_runtime_failures := audit.run_function_runtime_probes();
  -- Runtime probe failures land in audit.broken_functions AFTER refresh_static
  -- wrote its log row; recount so the log matches the table it describes.
  perform audit.refresh_log_recount();
  return v_note || '; runtime_probe_failures=' || v_runtime_failures::text;
end;
$fn$;

-- Runtime probes must classify too, or they arrive with a NULL severity and
-- fall out of every count.
create or replace function audit.run_function_runtime_probes()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare r record; v_failures integer := 0;
begin
  for r in
    select function_signature, probe_sql
    from audit.function_runtime_probe
    where enabled
    order by function_signature
  loop
    begin
      execute r.probe_sql;
    exception when others then
      v_failures := v_failures + 1;
      insert into audit.broken_functions(
        schema_name, function_name, signature, level, sqlstate, message, context, severity
      ) values (
        split_part(r.function_signature, '.', 1),
        split_part(split_part(r.function_signature, '.', 2), '(', 1),
        r.function_signature,
        'runtime_error',
        sqlstate,
        sqlerrm,
        'Registered read-only runtime probe: ' || r.probe_sql,
        'real'
      );
    end;
  end loop;
  return v_failures;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Assert the never-suppress floor still holds, then rebuild
-- ─────────────────────────────────────────────────────────────────────────────

do $assert$
declare v_sev text; v_probe oid;
begin
  -- Any function oid works; the floor short-circuits before touching it.
  select 'audit.refresh_log_recount()'::regprocedure::oid into v_probe;

  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'error', '42P10', 'there is no unique or exclusion constraint matching the ON CONFLICT specification');
  if v_sev is distinct from 'real' then
    raise exception 'REGRESSION: the ON CONFLICT class (42P10) classified as %, not real. '
      'admin_configure_entity_access / admin_set_containment_edge were real 42P10 bugs; '
      'this class must never be suppressed.', v_sev;
  end if;

  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'error', '42P01', 'relation "totally_absent_table" does not exist');
  if v_sev is distinct from 'real' then
    raise exception 'REGRESSION: a genuinely missing relation classified as %, not real.', v_sev;
  end if;

  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'error', '42P01', 'relation "education.{study_session,study_attempt}" does not exist');
  if v_sev is distinct from 'suppressed' then
    raise exception 'Runtime-built relation name classified as %, expected suppressed.', v_sev;
  end if;
end $assert$;

select audit.refresh();
