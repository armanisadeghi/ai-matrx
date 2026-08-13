-- audit_classifier_floor_errors_only.sql
--
-- Follow-up to audit_broken_functions_severity_and_search_path.sql (same day).
-- The never-suppress sqlstate floor was evaluated BEFORE the level dispatch, so
-- it also caught plpgsql_check WARNINGS that happen to share a sqlstate with a
-- real error. Measured live: 18 rows of "target type is different type than
-- source type" (a pure style warning, sqlstate 42804) were classified `real`
-- alongside the one genuine 42804 error ("structure of query does not match
-- function result type"), inflating the actionable count from 5 signatures to 19.
--
-- The floor exists to protect ERRORS from being classified away (the
-- admin_configure_entity_access / admin_set_containment_edge 42P10 class). A
-- warning is never a runtime failure regardless of its sqlstate, so the floor
-- now applies only to level='error'.
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

  -- plpgsql_check warnings are style/perf advice, never a runtime failure.
  -- This MUST be decided before the sqlstate floor below: warnings reuse
  -- error sqlstates (42804 covers both "target type is different type than
  -- source type" — noise — and "structure of query does not match function
  -- result type" — real).
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
    v_def := pg_get_functiondef(p_func_oid);
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

    return query select 'real'::text, null::text; return;
  end if;

  -- record "new"/"old" has no field "X"
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

    -- A SHARED trigger function branching on the table it fired for: several
    -- attachments and the field genuinely exists on at least one of them. A
    -- single-table trigger, or one where NO attached table has the field,
    -- stays real.
    if coalesce(v_attachments, 0) > 1 and coalesce(v_with_field, 0) > 0 then
      return query select 'suppressed'::text, 'shared_trigger_branch'::text; return;
    end if;

    return query select 'real'::text, null::text; return;
  end if;

  return query select 'real'::text, null::text;
end;
$fn$;

do $assert$
declare v_sev text; v_probe oid := 'audit.refresh_log_recount()'::regprocedure::oid;
begin
  -- The floor still protects errors.
  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'error', '42P10', 'there is no unique or exclusion constraint matching the ON CONFLICT specification');
  if v_sev is distinct from 'real' then
    raise exception 'REGRESSION: the ON CONFLICT class (42P10) classified as %, not real.', v_sev;
  end if;

  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'error', '42804', 'structure of query does not match function result type');
  if v_sev is distinct from 'real' then
    raise exception 'REGRESSION: a real 42804 error classified as %, not real.', v_sev;
  end if;

  -- ...and no longer leaks into warnings that share its sqlstate.
  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'warning', '42804', 'target type is different type than source type');
  if v_sev is distinct from 'style' then
    raise exception 'A 42804 WARNING classified as %, expected style.', v_sev;
  end if;

  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'error', '42P01', 'relation "totally_absent_table" does not exist');
  if v_sev is distinct from 'real' then
    raise exception 'REGRESSION: a genuinely missing relation classified as %, not real.', v_sev;
  end if;
end $assert$;

select audit.refresh();
