-- based-on: audit.classify_broken_function(oid, text, text, text) 4b4cac11b5430e0620c65988d234cd0906f4c049ee74f6807c787c298e5422be
-- audit_classifier_dynamic_loop_records_and_regclass_literals.sql
--
-- Three more FALSE-POSITIVE shapes in audit.classify_broken_function(), each
-- proven against a live function before being taught to the classifier. The
-- live body is patched in place (count-asserted inserts at fixed anchors), so
-- nothing else in it can be reverted by this file.
--
-- A. `record "X" has no field "F"` where X is the loop variable of
--    `FOR X IN EXECUTE <query>` and F is named in that query. plpgsql_check
--    cannot see the columns of a dynamic query. (platform.tags_backfill:
--    `for r in execute format('select id, organization_id, created_by, tags …')`
--    then `r.tags`.) Suppressed as `dynamic_sql_loop_record` only when F appears
--    between `for X in execute` and the end of that statement.
--
-- B. `record "X" is not assigned yet` where X is filled by
--    `SELECT … INTO X FROM …(Y.…)` and Y is a `FOR Y IN EXECUTE` loop variable —
--    the checker cannot evaluate Y, so it never sees X assigned.
--    (custom.read_records_matching: `for v_rec in execute v_sql loop
--    select * into v_vs from custom.record_values_step(v_rec.rw, v_cache);`.)
--    Suppressed under the existing reason `cascade_dynamic_sql_loop`.
--
-- C. `invalid input syntax for type oid: "S"` where the body declares
--    `<var> oid := 'S'::regclass`. regclass → oid is binary-coercible at run time;
--    the checker converts through text instead. Proven live with
--    `do $$ declare parent oid := 'history.row_versions'::regclass; begin end $$`.
--    (platform.lifecycle_tier_ledger_check / _record.) Suppressed as
--    `regclass_literal_into_oid` only when 'S'::regclass is literally in the body
--    AND S names a relation that exists — a missing relation stays real.
--
-- Blast radius as before: audit.refresh_static, audit.function_broken_live (the
-- certification gate's live check — suppression can only lift a false block)
-- and the audit.refresh_log counts. No client or server code calls it.
--
-- Idempotent only as a whole-file apply (the anchors are asserted once).

do $patch$
declare
  v_def text;
  v_anchor text;
  v_ins text;
  v_n integer;
begin
  v_def := pg_get_functiondef('audit.classify_broken_function(oid,text,text,text)'::regprocedure);

  -- C: before the "relation does not exist" section (errors-only area, v_def set).
  v_anchor := E'  -- relation "X" does not exist\n';
  v_ins := $ins$
  -- invalid input syntax for type oid: "S" — a regclass literal assigned to an oid
  -- variable; binary-coercible at run time, converted through text by the checker.
  if p_sqlstate = '22P02' and p_message ~ '^invalid input syntax for type oid: "' then
    v_leaf_rel := (regexp_match(p_message, 'type oid: "([^"]+)"'))[1];
    if v_leaf_rel is not null
       and strpos(lower(v_def), lower('''' || v_leaf_rel || '''::regclass')) > 0
       and to_regclass(v_leaf_rel) is not null then
      return query select 'suppressed'::text, 'regclass_literal_into_oid'::text; return;
    end if;
  end if;

$ins$;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then raise exception 'anchor C found % times, expected 1', v_n; end if;
  v_def := replace(v_def, v_anchor, v_ins || v_anchor);

  -- B: inside the "not assigned yet" branch, before the transition-table rule.
  v_anchor := E'    -- The loop reads a transition table the checker cannot see (class 2).\n';
  v_ins := $ins$    -- X is filled by SELECT … INTO X FROM …(Y.…) where Y is a FOR … IN EXECUTE record.
    if exists (
      select 1 from regexp_matches(v_def, 'for\s+([a-z0-9_]+)\s+in\s+execute', 'gi') lv
      where v_def ~* ('into\s+' || v_unassigned || '\s+from[^;]*\m' || lower(lv[1]) || '\.')
    ) then
      return query select 'suppressed'::text, 'cascade_dynamic_sql_loop'::text; return;
    end if;
$ins$;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then raise exception 'anchor B found % times, expected 1', v_n; end if;
  v_def := replace(v_def, v_anchor, v_ins || v_anchor);

  -- A: first thing inside the "has no field" branch.
  v_anchor := E'  if v_field is not null then\n';
  v_ins := $ins$    -- X is a FOR X IN EXECUTE record and F is a column its query names.
    if v_recname is not null
       and v_def ~* ('for\s+' || v_recname || '\s+in\s+execute[^;]*\m' || v_field || '\M') then
      return query select 'suppressed'::text, 'dynamic_sql_loop_record'::text; return;
    end if;

$ins$;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then raise exception 'anchor A found % times, expected 1', v_n; end if;
  v_def := replace(v_def, v_anchor, v_anchor || v_ins);

  execute v_def;
end $patch$;

select audit.refresh();

do $assert$
declare
  v_sev text; v_reason text;
  v_probe oid := 'audit.refresh_log_recount()'::regprocedure::oid;
  v_tags  oid := 'platform.tags_backfill(text,uuid,integer)'::regprocedure::oid;
  v_rrm   oid := 'custom.read_records_matching(uuid,uuid,jsonb,boolean,integer,integer)'::regprocedure::oid;
  v_lc    oid := 'platform.lifecycle_tier_ledger_check(text,text)'::regprocedure::oid;
begin
  -- The floor and the earlier classes still hold.
  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'error', '42P10', 'there is no unique or exclusion constraint matching the ON CONFLICT specification');
  if v_sev is distinct from 'real' then raise exception 'REGRESSION: 42P10 classified %', v_sev; end if;

  -- A: a field named in the dynamic query is suppressed...
  select severity, suppression_reason into v_sev, v_reason from audit.classify_broken_function(
    v_tags, 'error', '42703', 'record "r" has no field "tags"');
  if v_sev is distinct from 'suppressed' or v_reason is distinct from 'dynamic_sql_loop_record' then
    raise exception 'A: tags_backfill r.tags classified % / %', v_sev, v_reason;
  end if;
  -- ...a field the dynamic query does NOT name stays real.
  select severity into v_sev from audit.classify_broken_function(
    v_tags, 'error', '42703', 'record "r" has no field "no_such_column"');
  if v_sev is distinct from 'real' then raise exception 'A: unnamed field classified %', v_sev; end if;

  -- B: the cascade from the dynamic loop record is suppressed...
  select severity, suppression_reason into v_sev, v_reason from audit.classify_broken_function(
    v_rrm, 'error', '55000', 'record "v_vs" is not assigned yet');
  if v_sev is distinct from 'suppressed' or v_reason is distinct from 'cascade_dynamic_sql_loop' then
    raise exception 'B: read_records_matching v_vs classified % / %', v_sev, v_reason;
  end if;
  -- ...an unrelated unassigned record in the same function stays real.
  select severity into v_sev from audit.classify_broken_function(
    v_rrm, 'error', '55000', 'record "v_never_filled" is not assigned yet');
  if v_sev is distinct from 'real' then raise exception 'B: unrelated record classified %', v_sev; end if;

  -- C: the regclass literal is suppressed...
  select severity, suppression_reason into v_sev, v_reason from audit.classify_broken_function(
    v_lc, 'error', '22P02', 'invalid input syntax for type oid: "history.row_versions"');
  if v_sev is distinct from 'suppressed' or v_reason is distinct from 'regclass_literal_into_oid' then
    raise exception 'C: lifecycle regclass classified % / %', v_sev, v_reason;
  end if;
  -- ...a relation that does not exist stays real, and so does a body without the literal.
  select severity into v_sev from audit.classify_broken_function(
    v_lc, 'error', '22P02', 'invalid input syntax for type oid: "history.no_such_table"');
  if v_sev is distinct from 'real' then raise exception 'C: missing relation classified %', v_sev; end if;
  select severity into v_sev from audit.classify_broken_function(
    v_probe, 'error', '22P02', 'invalid input syntax for type oid: "history.row_versions"');
  if v_sev is distinct from 'real' then raise exception 'C: body without the literal classified %', v_sev; end if;
end $assert$;
