-- audit_live_broken_dependent_check.sql
--
-- THE CERTIFICATION GATE WAS MEASURING A CACHE, NOT THE DATABASE.
--
-- iam.canonical_certify emits a `broken_dependent_fn` FAIL for every function
-- audit.table_impact() reports as `currently_broken`, and that flag read
-- audit.broken_functions -- a TABLE, i.e. a snapshot that only ever changes
-- when somebody runs audit.refresh() (or audit.refresh_static()) by hand. The
-- gate neither refreshed it nor said how old it was, so its verdict was the
-- state of the database at some unknown past moment.
--
-- Found 2026-08-27 during HR certification: 10 of 13 red `broken_dependent_fn`
-- tokens named functions that had been fixed hours earlier; the snapshot was
-- last rebuilt at 05:15 UTC. That direction is merely infuriating -- an agent
-- chases ghosts, or learns to re-run refresh and ignore red. THE REVERSE
-- DIRECTION IS THE REAL DEFECT: break a function AFTER the last refresh and
-- every table it touches certifies GREEN, and `canonical_certify_ok` -- the
-- "nothing is done until this is true" gate of db-rules 0.6 -- returns true
-- while the database is broken. A gate whose answer depends on when somebody
-- last pressed a button is not a gate.
--
-- THE FIX: MEASURE, DON'T REMEMBER.
--
-- (1) audit.function_broken_live(oid) -- runs plpgsql_check on ONE function,
--     right now, under that function's OWN effective search path, and passes
--     the findings through audit.classify_broken_function(). Same checker,
--     same path resolution, same single definition of severity as
--     audit.refresh_static(); this is a slice of that loop, not a second
--     opinion. severity='real' on any finding => broken.
--
-- (2) audit.table_impact().currently_broken is now that live call, OR'd with
--     the snapshot's `runtime_error` rows. The OR is deliberate and is the one
--     thing that CANNOT go live here: a runtime probe is proof-by-execution
--     (audit.run_function_runtime_probes() WRITES, so a STABLE gate can never
--     run one), and static checking provably cannot see that class -- the
--     get_project_references outage that started this whole series was a
--     privilege error inside dynamic SQL. Dropping those rows would trade one
--     blind spot for another.
--
-- (3) iam.canonical_certify reports the snapshot age of that residual lane on
--     every call, as a non-blocking `snapshot` / INFO row, so no reader has to
--     wonder again. iam.canonical_certify_ok ignores INFO -- INFO is the only
--     non-blocking status the certify contract has, and blocking rows are
--     still exactly FAIL + WARN.
--
-- COST: the live check is ~20ms per plpgsql candidate and the candidate set is
-- per-table (28 functions / 0.58s total for hr.employee, measured live). It is
-- not the 4.5-5.5s of a full audit.refresh(), because it checks the functions
-- that touch THIS table instead of every plpgsql function in the database.
--
-- NOT CHANGED: audit.refresh_static() and audit.broken_functions keep doing
-- exactly what they did. The store is still the database-wide report and still
-- drives audit.summary, the ratchets and the canonicalization UI. What changed
-- is that the per-table GATE no longer depends on how fresh it happens to be.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The live single-function check.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function audit.function_broken_live(p_func_oid oid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_ext     text;
  v_relid   oid;
  v_rettype oid;
  v_config  text[];
  v_lang    name;
  v_sp      text;
  v_sql     text;
  w         record;
  v_sev     text;
begin
  select l.lanname, p.prorettype, p.proconfig
    into v_lang, v_rettype, v_config
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.oid = p_func_oid;

  -- plpgsql_check only understands plpgsql. A SQL-language function is
  -- 'unchecked', which is the same verdict the store records for it (it is
  -- never inserted into audit.broken_functions at all).
  if v_lang is distinct from 'plpgsql' then
    return false;
  end if;

  select n.nspname into v_ext
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'plpgsql_check';
  if v_ext is null then
    return false;
  end if;

  -- A trigger function must be checked against a table it is attached to;
  -- attached to none it is 'unchecked' (refresh_static records it that way).
  if v_rettype = 'pg_catalog.trigger'::regtype then
    select tg.tgrelid into v_relid
    from pg_trigger tg
    where tg.tgfoid = p_func_oid and not tg.tgisinternal
    limit 1;
    if v_relid is null then
      return false;
    end if;
  else
    v_relid := 0;
  end if;

  -- Resolve names the way the function itself will at runtime. Checking under
  -- pg_catalog is the 2026-08-13 false-positive class (101 rows for 3 real
  -- bugs); this function exists to give the same answer as refresh_static, so
  -- it must resolve the path the same way.
  --
  -- set_config(), not SET: a plain SET statement is rejected outright inside a
  -- non-volatile function ("SET is not allowed in a non-volatile function"),
  -- and this function must stay STABLE so the STABLE certification gate can
  -- call it. set_config(..., is_local => true) makes the same change, and this
  -- function's own SET clause restores the path on exit -- exception paths
  -- included.
  v_sp := audit.effective_search_path(v_config);
  begin
    perform set_config('search_path', v_sp, true);
  exception when others then
    perform set_config('search_path', 'pg_temp, "$user", public, extensions', true);
  end;

  v_sql := format(
    'select level, sqlstate, message from %I.plpgsql_check_function_tb($1,$2,false)',
    v_ext);
  begin
    for w in execute v_sql using p_func_oid::regprocedure, v_relid loop
      if w.level in ('error','warning') then
        select cb.severity into v_sev
        from audit.classify_broken_function(p_func_oid, w.level, w.sqlstate, w.message) cb;
        if v_sev = 'real' then
          return true;
        end if;
      end if;
    end loop;
  exception when others then
    -- The checker itself fell over: 'unchecked', never 'broken'. refresh_static
    -- takes the same branch. A checker failure must not fail a release.
    return false;
  end;

  return false;
  -- search_path is restored by this function's own SET clause on exit,
  -- including on the exception paths above.
end;
$function$;

comment on function audit.function_broken_live(oid) is
  'Live plpgsql_check of ONE function under its own effective search path, classified by audit.classify_broken_function. true = a severity=real finding right now. The un-cached slice of audit.refresh_static() that iam.canonical_certify measures with.';

-- Grants match audit.table_impact / classify_broken_function / effective_search_path,
-- the rest of this call path: EXECUTE to PUBLIC, reachable only by roles that
-- already hold USAGE on the audit schema (anon does not). Locking these two
-- down instead BREAKS iam.canonical_certify, which is itself PUBLIC and
-- invoker-rights -- proven live: `set role authenticated` then certify returned
-- "permission denied for function broken_functions_snapshot_age". Neither
-- function exposes a finding: one returns a boolean, the other a timestamp.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The residual snapshot's age, as one readable string.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function audit.broken_functions_snapshot_age()
returns text
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select case
    when max(run_at) is null then 'runtime_probe_lane=NEVER REFRESHED (audit.refresh() has never run)'
    else 'runtime_probe_lane_age=' ||
         (extract(epoch from (now() - max(run_at)))/3600)::numeric(10,1)::text || 'h' ||
         ' (last audit.refresh ' || to_char(max(run_at) at time zone 'UTC','YYYY-MM-DD HH24:MI') || ' UTC)'
  end
  from audit.refresh_log;
$function$;

comment on function audit.broken_functions_snapshot_age() is
  'Age of the only cached lane iam.canonical_certify still reads (runtime-probe failures). The static lane is measured live per call and has no age.';

grant execute on function audit.function_broken_live(oid) to public;
grant execute on function audit.broken_functions_snapshot_age() to public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. table_impact: currently_broken becomes a measurement.
--    Return signature is byte-identical to the previous definition.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function audit.table_impact(p_schema text, p_table text)
returns table(function_sig text, dependency text, currently_broken boolean, referenced_columns text[])
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
DECLARE v_cols text[]; v_qual text;
BEGIN
  SELECT array_agg(column_name) INTO v_cols FROM information_schema.columns WHERE table_schema=p_schema AND table_name=p_table;
  v_cols := COALESCE(v_cols,'{}');
  v_qual := '\m'||p_schema||'\.'||p_table||'\M';
  RETURN QUERY
  WITH cand AS (
    SELECT p.oid AS func_oid, (p.oid::regprocedure)::text AS sig, pg_get_functiondef(p.oid) AS def,
      EXISTS(SELECT 1 FROM audit.function_deps fd WHERE fd.signature=(p.oid::regprocedure)::text
             AND fd.dep_type='RELATION' AND fd.dep_schema=p_schema AND fd.dep_name=p_table) AS precise
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN (SELECT schema_name FROM meta.excluded_schema) AND n.nspname<>'audit'
      AND p.prokind='f'
      AND p.prolang IN (SELECT oid FROM pg_language WHERE lanname IN ('plpgsql','sql'))
  ), hit AS (
    SELECT c.* FROM cand c WHERE c.precise OR c.def ~ v_qual
  )
  SELECT h.sig,
         CASE WHEN h.precise THEN 'precise' ELSE 'text-qualified' END,
         -- MEASURED NOW (static), plus the one lane that can only be proven by
         -- executing the function. See the header of this migration.
         audit.function_broken_live(h.func_oid)
         OR EXISTS(SELECT 1 FROM audit.broken_functions bf
                   WHERE bf.signature=h.sig AND bf.severity='real' AND bf.level='runtime_error'),
         ARRAY(SELECT col FROM unnest(v_cols) col WHERE h.def ~ ('\m'||col||'\M'))
  FROM hit h
  ORDER BY h.precise DESC, h.sig;
END; $function$;

comment on function audit.table_impact(text,text) is
  'Preflight: every function touching a table. currently_broken is measured LIVE (plpgsql_check now) OR-ed with cached runtime-probe failures -- it does NOT depend on when audit.refresh() last ran.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. canonical_certify: same blocking rows, plus the age of what is still cached.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function iam.canonical_certify(p_schema text, p_table text, p_token text)
returns table(category text, status text, detail text)
language sql
stable
as $function$
  SELECT 'conformance', vc.status, vc.check_name||COALESCE(': '||vc.detail,'')
  FROM iam.verify_canonical(p_schema,p_table,p_token) vc WHERE vc.status IN ('FAIL','WARN')
  UNION ALL
  SELECT 'broken_dependent_fn','FAIL', ti.function_sig
  FROM audit.table_impact(p_schema,p_table) ti WHERE ti.currently_broken
  UNION ALL
  -- Non-blocking. The static broken-function lane is measured live per call;
  -- this reports the age of the runtime-probe lane, which is the only cached
  -- input left. INFO is ignored by canonical_certify_ok.
  SELECT 'snapshot','INFO',
         'static_broken_fn_lane=LIVE; ' || audit.broken_functions_snapshot_age();
$function$;

comment on function iam.canonical_certify(text,text,text) is
  'The done-gate detail. Blocking rows are status FAIL/WARN; status INFO is reporting only. Broken dependent functions are measured live, not read from the audit snapshot.';

create or replace function iam.canonical_certify_ok(p_schema text, p_table text, p_token text)
returns boolean
language sql
stable
as $function$
  SELECT NOT EXISTS(
    SELECT 1 FROM iam.canonical_certify(p_schema,p_table,p_token) cc
    WHERE cc.status <> 'INFO'
  );
$function$;

comment on function iam.canonical_certify_ok(text,text,text) is
  'The "done" gate (db-rules 0.6). True when iam.canonical_certify returns no FAIL and no WARN. INFO rows (snapshot age) are reporting only.';

commit;
