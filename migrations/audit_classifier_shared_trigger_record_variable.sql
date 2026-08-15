-- audit_classifier_shared_trigger_record_variable.sql
--
-- Closes a FALSE-POSITIVE gap in audit.classify_broken_function(), found the way
-- these should be found: a `real` finding that turned out not to be real.
--
-- `agent.notify_definition_changed()` was reported as genuine breakage —
--   42703  record "v_row" has no field "agent_id"
-- — but it is the same shared-trigger-branch artifact the classifier already
-- suppresses. The function is attached to BOTH agent.definition and
-- agent.definition_version and branches on the table it fired for:
--
--     v_row := COALESCE(NEW, OLD);
--     IF TG_TABLE_NAME = 'definition_version' THEN
--         v_agent_id := v_row.agent_id;   -- only ever runs for definition_version
--     ELSE
--         v_agent_id := v_row.id;         -- the definition branch
--     END IF;
--
-- Verified against the catalog: agent.definition_version HAS agent_id,
-- agent.definition does not, and the line that reads it is unreachable for the
-- latter. plpgsql_check has to check one attachment at a time, so it flags the
-- branch belonging to the other table.
--
-- Why the existing rule missed it: it matched only the literal record names
-- `new` / `old`. Here the trigger row is copied into a local record variable
-- first, which is the ordinary way to write a trigger that handles INSERT,
-- UPDATE and DELETE in one body. The artifact is identical; only the identifier
-- differs.
--
-- The generalization stays mechanical and stays narrow. A "record X has no field
-- F" error is suppressed as shared_trigger_branch only when ALL of:
--   * the function is a TRIGGER function, and
--   * it is attached to MORE THAN ONE table, and
--   * at least one attached table actually has column F, and
--   * X is `new`/`old`, OR X is provably the trigger row — the body contains an
--     assignment `X := … NEW … / … OLD …`.
-- That last clause is the new guard: without it, a record populated from an
-- unrelated SELECT could be suppressed just because some attached table happened
-- to share a column name. A single-attachment trigger, or one where NO attached
-- table has the field, still reports `real`.
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

select audit.refresh();

do $assert$
declare v_sev text; v_reason text; v_probe oid := 'audit.refresh_log_recount()'::regprocedure::oid;
begin
  -- The floor still protects errors (the regression pair that must stay visible).
  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'error', '42P10', 'there is no unique or exclusion constraint matching the ON CONFLICT specification');
  if v_sev is distinct from 'real' then
    raise exception 'REGRESSION: the ON CONFLICT class (42P10) classified as %, not real.', v_sev;
  end if;

  -- The gap this migration closes: a trigger row copied into a local record.
  select severity, suppression_reason into v_sev, v_reason
  from audit.classify_broken_function(
    'agent.notify_definition_changed()'::regprocedure::oid,
    'error', '42703', 'record "v_row" has no field "agent_id"');
  if v_sev is distinct from 'suppressed' or v_reason is distinct from 'shared_trigger_branch' then
    raise exception 'notify_definition_changed v_row classified % / %, expected suppressed / shared_trigger_branch.', v_sev, v_reason;
  end if;

  -- ...and it must NOT fire for a field no attached table has.
  select severity into v_sev from audit.classify_broken_function(
    'agent.notify_definition_changed()'::regprocedure::oid,
    'error', '42703', 'record "v_row" has no field "column_no_attached_table_has"');
  if v_sev is distinct from 'real' then
    raise exception 'A field absent from EVERY attached table classified as %, expected real.', v_sev;
  end if;

  -- ...and never for a non-trigger function.
  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'error', '42703', 'record "v_row" has no field "agent_id"');
  if v_sev is distinct from 'real' then
    raise exception 'A non-trigger function classified as %, expected real.', v_sev;
  end if;
end $assert$;
