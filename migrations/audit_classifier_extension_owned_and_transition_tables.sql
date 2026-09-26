-- based-on: audit.classify_broken_function(oid, text, text, text) 9c35b9f9abc98f8cf96cbb9a7d1198e7b085d352905b5f899ff21388c3131ae5
-- audit_classifier_extension_owned_and_transition_tables.sql
--
-- Closes two FALSE-POSITIVE classes in audit.classify_broken_function(). On
-- 2026-09-26 the admin headline read "37 broken functions"; 28 of them were
-- these two artifacts, not breakage.
--
-- 1. EXTENSION-OWNED CODE (10 functions, all pg_partman). pg_partman's bodies
--    call pg_jobmon's add_job / add_step / update_step / close_job / fail_job,
--    guarded at runtime by "is pg_jobmon installed?" — it is not, so those
--    calls never run. The code is shipped by the extension, is not ours, and
--    cannot be fixed here. Rule: a function that is a member of an installed
--    extension (pg_depend deptype 'e') is suppressed as `extension_owned` —
--    UNLESS a registered runtime probe actually executed it and it failed
--    (level = runtime_error stays real, checked first).
--
-- 2. TRIGGER TRANSITION TABLES (18 functions). A statement-level trigger that
--    declares REFERENCING NEW TABLE AS new_rows / OLD TABLE AS old_rows reads
--    those names as relations. plpgsql_check checks the function body in
--    isolation, so it reports `relation "new_rows" does not exist`. Rule: the
--    missing relation is suppressed as `trigger_transition_table` ONLY when a
--    trigger that actually fires this function declares a transition table of
--    exactly that name (pg_trigger.tgnewtable / tgoldtable). Detach the trigger
--    or rename the transition table and the finding returns as real.
--    The same functions also report `record "k" is not assigned yet` for the
--    loop variable of a FOR over that transition table — a cascade of the same
--    blindness. Suppressed as `cascade_transition_table_loop` only when the
--    function has such a trigger AND the body loops FOR <var> IN over a query
--    that names that transition table.
--
-- Blast radius: this function's callers are audit.refresh_static (writes
-- severity into audit.broken_functions), audit.function_broken_live (the
-- certification gate's live check — a suppressed row can only STOP a false
-- block, never cause one), and the counts in audit.refresh_log. No client or
-- server code calls it; the admin page reads the stored severity.
--
-- Idempotent. Safe to re-run.

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
  v_leaf_rel     text;
  v_field        text;
  v_recname      text;
  v_unassigned   text;
  v_is_trigger   boolean;
  v_attachments  integer;
  v_with_field   integer;
begin
  if p_level = 'check_skipped' then
    return query select 'unchecked'::text, null::text; return;
  end if;

  if p_level = 'privilege_risk' then
    return query select 'advisory'::text, null::text; return;
  end if;

  -- A registered runtime probe actually executed and actually failed.
  if p_level = 'runtime_error' then
    return query select 'real'::text, null::text; return;
  end if;

  -- Code shipped by an installed extension is not ours and cannot be fixed
  -- here; its static findings are the extension's own (see header, class 1).
  if exists (
    select 1 from pg_depend d
    where d.classid = 'pg_catalog.pg_proc'::regclass
      and d.objid = p_func_oid
      and d.refclassid = 'pg_catalog.pg_extension'::regclass
      and d.deptype = 'e'
  ) then
    return query select 'suppressed'::text, 'extension_owned'::text; return;
  end if;

  -- plpgsql_check warnings are style/perf advice, never a runtime failure.
  -- Decided BEFORE the sqlstate floor: warnings reuse error sqlstates (42804
  -- covers both "target type is different type than source type" — noise — and
  -- "structure of query does not match function result type" — real).
  if p_level = 'warning' then
    return query select 'style'::text, null::text; return;
  end if;

  if p_level <> 'error' then
    return query select 'real'::text, null::text; return;
  end if;

  -- ── ERRORS ONLY from here down ────────────────────────────────────────────

  -- The floor: these can only ever be real. 42P10 is pinned because of the
  -- admin_configure_entity_access / admin_set_containment_edge ON CONFLICT bugs
  -- (real 42P10 failures, fixed 2026-08-13) — a reintroduction must never be
  -- classified away by any rule added later.
  if p_sqlstate in ('42P10', '42803', '42804', '42846', '2D000') then
    return query select 'real'::text, null::text; return;
  end if;

  v_def := pg_get_functiondef(p_func_oid);

  -- relation "X" does not exist
  v_missing_rel := (regexp_match(coalesce(p_message, ''), 'relation "([^"]+)" does not exist'))[1];
  if v_missing_rel is not null then
    -- (a) built at runtime: an array literal or format placeholder read as a name
    if v_missing_rel ~ '[{},%$]' then
      return query select 'suppressed'::text, 'runtime_built_relation_name'::text; return;
    end if;

    -- (b) a temp table this very function creates — plpgsql_check runs before
    --     the CREATE TEMP TABLE ever executes, so it can never see it.
    v_leaf_rel := (regexp_match(v_missing_rel, '([^.]+)$'))[1];
    if exists (
      select 1
      from regexp_matches(
             v_def,
             'create\s+(?:temp|temporary)\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)',
             'gi') m
      where lower(m[1]) = lower(v_leaf_rel)
    ) then
      return query select 'suppressed'::text, 'self_created_temp_table'::text; return;
    end if;

    -- (c) a transition table declared by a trigger that fires this function.
    if exists (
      select 1 from pg_trigger tg
      where tg.tgfoid = p_func_oid and not tg.tgisinternal
        and (tg.tgnewtable = v_missing_rel or tg.tgoldtable = v_missing_rel)
    ) then
      return query select 'suppressed'::text, 'trigger_transition_table'::text; return;
    end if;

    return query select 'real'::text, null::text; return;
  end if;

  -- record "X" is not assigned yet — a cascade whenever X is the loop variable
  -- of a FOR the checker cannot see into.
  v_unassigned := (regexp_match(coalesce(p_message, ''), 'record "([a-z0-9_]+)" is not assigned yet'))[1];
  if v_unassigned is not null then
    if v_def ~* ('for\s+' || v_unassigned || '\s+in\s+execute') then
      return query select 'suppressed'::text, 'cascade_dynamic_sql_loop'::text; return;
    end if;
    if v_def ~* ('for\s+' || v_unassigned || '\s+in\s')
       and v_def ~* 'create\s+(?:temp|temporary)\s+table' then
      return query select 'suppressed'::text, 'cascade_self_created_temp_table_loop'::text; return;
    end if;
    -- The loop reads a transition table the checker cannot see (class 2).
    if exists (
      select 1 from pg_trigger tg
      cross join lateral unnest(array[tg.tgnewtable, tg.tgoldtable]) t(name)
      where tg.tgfoid = p_func_oid and not tg.tgisinternal
        and t.name is not null
        and v_def ~* ('for\s+' || v_unassigned || '\s+in\s[^;]*\m' || t.name || '\M')
    ) then
      return query select 'suppressed'::text, 'cascade_transition_table_loop'::text; return;
    end if;
    return query select 'real'::text, null::text; return;
  end if;

  -- record "X" has no field "F" — X may be new/old, or a local record the body
  -- copied the trigger row into (v_row := COALESCE(NEW, OLD), the standard way
  -- to write one body for INSERT/UPDATE/DELETE).
  v_recname := (regexp_match(coalesce(p_message, ''), 'record "([a-z0-9_]+)" has no field "[^"]+"'))[1];
  v_field   := (regexp_match(coalesce(p_message, ''), 'record "[a-z0-9_]+" has no field "([^"]+)"'))[1];
  if v_field is not null then
    select p.prorettype = 'pg_catalog.trigger'::regtype into v_is_trigger
    from pg_proc p where p.oid = p_func_oid;

    select count(distinct tg.tgrelid),
           count(distinct tg.tgrelid) filter (
             where exists (
               select 1 from pg_attribute a
               where a.attrelid = tg.tgrelid and a.attname = v_field
                 and a.attnum > 0 and not a.attisdropped))
      into v_attachments, v_with_field
      from pg_trigger tg
      where tg.tgfoid = p_func_oid and not tg.tgisinternal;

    -- A SHARED trigger function branching on the table it fired for. Requires a
    -- real multi-table attachment AND the field genuinely existing on one of
    -- them AND — for a record that is not literally new/old — proof that the
    -- variable holds the trigger row.
    if coalesce(v_is_trigger, false)
       and coalesce(v_attachments, 0) > 1
       and coalesce(v_with_field, 0) > 0
       and (
         lower(coalesce(v_recname, '')) in ('new', 'old')
         or v_def ~* (coalesce(v_recname, '@@none@@') || '\s*:=\s*[^;]*\m(new|old)\M')
       )
    then
      return query select 'suppressed'::text, 'shared_trigger_branch'::text; return;
    end if;

    return query select 'real'::text, null::text; return;
  end if;

  return query select 'real'::text, null::text;
end;
$fn$;

-- Access decision (provision_shape_guard). Live ACL before this file was
-- postgres + service_role only; no client grant exists or is added.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('audit', 'classify_broken_function',
   'p_func_oid oid, p_level text, p_sqlstate text, p_message text',
   array['oid'::regtype, 'text'::regtype, 'text'::regtype, 'text'::regtype]::oid[],
   'p_func_oid is only read against pg_catalog (pg_proc, pg_trigger, pg_depend); no entity-id argument, no row data is read or returned.',
   'audit_classifier_extension_owned_and_transition_tables.sql',
   'server_only: called only inside the audit lane by audit.refresh_static and audit.function_broken_live, both SECURITY DEFINER as postgres; no client ever calls it.',
   false, false)
on conflict do nothing;

select audit.refresh();

do $assert$
declare
  v_sev text; v_reason text;
  v_probe oid := 'audit.refresh_log_recount()'::regprocedure::oid;
  v_partman oid := 'partman.run_maintenance(text,boolean,boolean)'::regprocedure::oid;
  v_stmt oid := 'custom._checklist_watch_stmt_update()'::regprocedure::oid;
begin
  -- The floor still protects errors.
  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'error', '42P10', 'there is no unique or exclusion constraint matching the ON CONFLICT specification');
  if v_sev is distinct from 'real' then
    raise exception 'REGRESSION: 42P10 classified as %, not real.', v_sev;
  end if;

  -- Class 1: extension-owned code is suppressed...
  select severity, suppression_reason into v_sev, v_reason from audit.classify_broken_function(
    v_partman, 'error', '42883', 'function add_job(text) does not exist');
  if v_sev is distinct from 'suppressed' or v_reason is distinct from 'extension_owned' then
    raise exception 'partman static error classified % / %, expected suppressed / extension_owned.', v_sev, v_reason;
  end if;
  -- ...but never a failed runtime probe.
  select severity into v_sev from audit.classify_broken_function(
    v_partman, 'runtime_error', 'P0001', 'probe failed');
  if v_sev is distinct from 'real' then
    raise exception 'extension runtime_error classified %, expected real.', v_sev;
  end if;
  -- ...and never our own function.
  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'error', '42883', 'function add_job(text) does not exist');
  if v_sev is distinct from 'real' then
    raise exception 'non-extension 42883 classified %, expected real.', v_sev;
  end if;

  -- Class 2: the declared transition table is suppressed...
  select severity, suppression_reason into v_sev, v_reason from audit.classify_broken_function(
    v_stmt, 'error', '42P01', 'relation "new_rows" does not exist');
  if v_sev is distinct from 'suppressed' or v_reason is distinct from 'trigger_transition_table' then
    raise exception 'transition table classified % / %, expected suppressed / trigger_transition_table.', v_sev, v_reason;
  end if;
  -- ...an undeclared relation on the same function stays real...
  select severity into v_sev from audit.classify_broken_function(
    v_stmt, 'error', '42P01', 'relation "no_such_rows" does not exist');
  if v_sev is distinct from 'real' then
    raise exception 'undeclared relation on a transition-table trigger classified %, expected real.', v_sev;
  end if;
  -- ...and a non-trigger function naming new_rows stays real.
  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'error', '42P01', 'relation "new_rows" does not exist');
  if v_sev is distinct from 'real' then
    raise exception 'new_rows on a non-trigger function classified %, expected real.', v_sev;
  end if;
  -- The loop cascade over the transition table is suppressed.
  select severity, suppression_reason into v_sev, v_reason from audit.classify_broken_function(
    v_stmt, 'error', '55000', 'record "k" is not assigned yet');
  if v_sev is distinct from 'suppressed' or v_reason is distinct from 'cascade_transition_table_loop' then
    raise exception 'transition loop cascade classified % / %, expected suppressed / cascade_transition_table_loop.', v_sev, v_reason;
  end if;
end $assert$;
