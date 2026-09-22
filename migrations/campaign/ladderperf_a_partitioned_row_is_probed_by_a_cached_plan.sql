-- chair-step: it REPLACES platform.entity_row_access_attrs and iam.owner_of - the platform's own access kernel - on the live path, and no knob can hold it OFF. Both keep their entire existing body as the general case; what is added is a prologue that asks a GENERATED, plan-cached probe first for the two PARTITIONED entity tables on this database, and hands the question straight back to the old body on anything it does not cover or anything that surprises it. Parity is proved instead: the same 5,000-pair snapshot as the file beside it (0 disagreements), plus PART 4 of scripts/campaign-tests/ladderperf_green.sql, which compares the generated probe against the six EXECUTE fallbacks it replaces on every sampled row.
-- based-on: platform.entity_row_access_attrs(text, text, uuid) b52d29a96d10ab8481ec7369489ebff9eaa80b9a49becf7cb20c62b6099895f0
-- based-on: iam.owner_of(text, uuid) 8d2ab2021d1d52dc4be6f886e08fb3f4c70a134bba77364ec0d3164930b30e4a
--
-- LADDER-PERF — A PARTITIONED ROW IS PROBED BY A CACHED PLAN, NOT BY A FRESH ONE EVERY TIME.
--
-- THE SECOND FACE OF THE SAME CLASS. `ladderperf_the_one_ladder_plans_once.sql` closed the
-- SQL-language half: a non-inlined SQL function re-plans its body on every call. This is the
-- plpgsql half, and it is worse, because plpgsql's `EXECUTE` NEVER caches a plan at all — by
-- design. Two functions in the access kernel's hot path are built on it:
--
--   platform.entity_row_access_attrs(schema, table, id)  -- six EXECUTE format() probes
--   iam.owner_of(resource_type, id)                      -- one EXECUTE format() probe
--
-- `iam.has_access_for_base` calls the first ONCE PER NODE of every containment walk, and
-- `iam.effective_level` calls the second on every call, so the one ladder pays both two or
-- three times for a single (member, record) question.
--
-- MEASURED ON THE MAIN DATABASE, 2026-09-20, warm, 50 calls per number, the same row each time:
--
--   platform.entity_row_access_attrs('custom','record', id)            0.881 ms
--   the same probe as STATIC plpgsql (plan cached), id only            0.139 ms
--   the same probe as EXECUTE, id only                                 0.814 ms
--   the same probe as EXECUTE, organization_id + id (one partition)    0.102 ms
--
-- So it is not the sixteen partitions at EXECUTION — a plan-cached scan of all sixteen costs
-- 0.139 ms. It is PLANNING a sixteen-partition Append, from scratch, every single call:
-- 0.814 ms against 0.102 ms for the same statement pruned to one partition. `custom.record` is
-- hash-partitioned on `organization_id` and both probes address a row BY ID ALONE, which can
-- prune nothing — so the kernel pays the full sixteen-way plan, several times per row, forever.
--
-- THE FIX IS THE RULE, NOT THE TABLE. "Every PARTITIONED entity table gets a plan-cached
-- probe" — and the probe is GENERATED FROM THE REGISTRY, so the rule holds for the next
-- partitioned table somebody provisions without anybody remembering this file:
--
--   platform.static_row_probe_spec()      what the probes must cover, read from
--                                         platform.entity_types and
--                                         platform.shareable_resource_registry, restricted to
--                                         relations whose relkind is 'p', with the SHAPE
--                                         resolved from the live catalogue exactly as
--                                         entity_row_access_attrs' six fallbacks resolve it
--   platform.static_row_probe_sql()       the text of the two generated functions
--   platform.rebuild_static_row_probes()  writes them and stamps the spec's fingerprint on them
--   platform.static_row_probes_stale()    the census: any partitioned entity or registry table
--                                         the generated probes do not cover, or a fingerprint
--                                         that no longer matches the registry. Zero rows is the
--                                         contract.
--
-- Today the spec is two rows — `custom.record` (16 partitions) and `history.row_versions`
-- (29) — plus one registry row, `record`. Nothing else on this database is partitioned.
--
-- NOTHING ABOUT ANY ANSWER CHANGES, and it is belt and braces:
--   * the SHAPE each arm uses is chosen by the same rule the dynamic chain falls through —
--     the first of the six probes whose columns all exist — so the generated arm returns what
--     the EXECUTE chain returned, column for column;
--   * "not found" is answered with plpgsql's own FOUND, never with an into-target, which is
--     the defect MIRROR-PERF's §4 found in this very shape (`select … , true into v_found`
--     sets v_found to NULL when nothing matched, so `if not v_found` never fires);
--   * every generated arm is wrapped in its own exception block that hands the question back
--     to the untouched dynamic chain if anything at all surprises it. The old path is still
--     there and is still the general case.
--
-- WHAT IT BUYS, measured after the first file, warm:
--   platform.entity_row_access_attrs   0.881 ms -> 0.157 ms
--   iam.owner_of                       0.884 ms -> 0.180 ms
--   custom.has_visibility, one member, one ordinary record   4.71 ms -> 2.52 ms
--

-- ---------------------------------------------------------------------------------------------
-- 1. THE SPEC — what a plan-cached probe has to cover, read from the registries.
-- ---------------------------------------------------------------------------------------------
create or replace function platform.static_row_probe_spec()
returns table(kind text, key text, schema_name text, table_name text,
              shape integer, id_column text, owner_column text)
language plpgsql
stable
security definer
set search_path to ''
as $fn$
begin
  return query
  with rel as (
    select n.nspname::text as schema_name, c.relname::text as table_name, c.oid
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'p'
  ), cols as (
    select r.schema_name, r.table_name,
           bool_or(a.attname = 'id')              as has_id,
           bool_or(a.attname = 'visibility')      as has_vis,
           bool_or(a.attname = 'created_by')      as has_created_by,
           bool_or(a.attname = 'owner_id')        as has_owner_id,
           bool_or(a.attname = 'organization_id') as has_org
      from rel r
      join pg_catalog.pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
     group by r.schema_name, r.table_name
  ), shaped as (
    -- The six fallbacks of platform.entity_row_access_attrs, in its own order. The first one
    -- whose columns all exist is the one the dynamic chain reaches, so it is the one to emit.
    select c.*,
           case
             when c.has_vis and c.has_created_by and c.has_org then 1
             when c.has_vis and c.has_owner_id   and c.has_org then 2
             when c.has_owner_id   and c.has_org               then 3
             when c.has_created_by and c.has_org               then 4
             when c.has_org                                    then 5
             else 6
           end as shape
      from cols c
     where c.has_id
  )
  select 'entity'::text, et.token::text, s.schema_name, s.table_name, s.shape,
         'id'::text, null::text
    from shaped s
    join platform.entity_types et
      on et.schema_name = s.schema_name and et.table_name = s.table_name and et.is_active
  union all
  select 'owner'::text, rr.resource_type::text, s.schema_name, s.table_name, 0,
         rr.id_column::text, rr.owner_column::text
    from shaped s
    join platform.shareable_resource_registry rr
      on rr.schema_name = s.schema_name and rr.table_name = s.table_name and rr.is_active
     and rr.owner_column is not null and rr.id_column is not null
  order by 1, 2;
end;
$fn$;

comment on function platform.static_row_probe_spec() is
  'LADDER-PERF: every PARTITIONED entity table and shareable-resource row that needs a '
  'plan-cached probe, with the probe shape resolved the way entity_row_access_attrs resolves it.';


-- ---------------------------------------------------------------------------------------------
-- 2. THE GENERATOR — the text of the two probes, and the writer that installs them.
-- ---------------------------------------------------------------------------------------------
create or replace function platform.static_row_probe_sql()
returns table(which text, ddl text)
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  rec  record;
  v_a  text := '';
  v_o  text := '';
  v_fp text;
begin
  select md5(string_agg(s.kind || '|' || s.key || '|' || s.schema_name || '|' || s.table_name
                        || '|' || s.shape::text || '|' || coalesce(s.id_column, '')
                        || '|' || coalesce(s.owner_column, ''), E'\n' order by s.kind, s.key))
    into v_fp
    from platform.static_row_probe_spec() s;
  v_fp := coalesce(v_fp, md5(''));

  for rec in select * from platform.static_row_probe_spec() s where s.kind = 'entity'
                order by s.schema_name, s.table_name
  loop
    v_a := v_a
      || '  if p_schema = ' || quote_literal(rec.schema_name)
      || ' and p_table = ' || quote_literal(rec.table_name) || ' then' || E'\n'
      || '    begin' || E'\n'
      || '      select '
      || case rec.shape
           when 1 then 't.visibility, t.created_by, t.organization_id'
           when 2 then 't.visibility, t.owner_id, t.organization_id'
           when 3 then '''personal''::platform.visibility, t.owner_id, t.organization_id'
           when 4 then '''personal''::platform.visibility, t.created_by, t.organization_id'
           when 5 then 'coalesce((select et.default_visibility from platform.entity_types et'
                       || ' where et.schema_name = ' || quote_literal(rec.schema_name)
                       || ' and et.table_name = ' || quote_literal(rec.table_name)
                       || ' limit 1), ''personal''::platform.visibility), null::uuid, t.organization_id'
           else        'coalesce((select et.default_visibility from platform.entity_types et'
                       || ' where et.schema_name = ' || quote_literal(rec.schema_name)
                       || ' and et.table_name = ' || quote_literal(rec.table_name)
                       || ' limit 1), ''personal''::platform.visibility), null::uuid, null::uuid'
         end
      || E'\n        into o_vis, o_owner, o_org' || E'\n'
      || '        from ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.table_name) || ' t' || E'\n'
      || '       where t.id = p_id;' || E'\n'
      -- plpgsql''s own FOUND, never an into-target: `select …, true into v_found` is NULL when
      -- nothing matched, which is the defect MIRROR-PERF section 4 names in this exact shape.
      || '      o_found := found;' || E'\n'
      || '      if not o_found then' || E'\n'
      || '        o_vis := ''personal''::platform.visibility; o_owner := null; o_org := null;' || E'\n'
      || '      end if;' || E'\n'
      || '      return;' || E'\n'
      || '    exception when others then' || E'\n'
      || '      o_handled := false; o_found := false;' || E'\n'
      || '      o_vis := ''personal''::platform.visibility; o_owner := null; o_org := null;' || E'\n'
      || '      return;' || E'\n'
      || '    end;' || E'\n'
      || '  end if;' || E'\n';
  end loop;

  for rec in select * from platform.static_row_probe_spec() s where s.kind = 'owner'
                order by s.key
  loop
    v_o := v_o
      || '  if p_resource_type = ' || quote_literal(rec.key) || ' then' || E'\n'
      || '    begin' || E'\n'
      -- The registry row can be switched off, and iam.owner_of answers null when it is; the
      -- generated arm asks the same question rather than assuming the generation-time answer.
      || '      if not exists (select 1 from platform.shareable_resource_registry rr' || E'\n'
      || '                      where rr.resource_type = ' || quote_literal(rec.key)
      || ' and rr.is_active) then' || E'\n'
      || '        o_handled := true; o_owner := null; return;' || E'\n'
      || '      end if;' || E'\n'
      || '      select t.' || quote_ident(rec.owner_column) || ' into o_owner' || E'\n'
      || '        from ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.table_name) || ' t' || E'\n'
      || '       where t.' || quote_ident(rec.id_column) || ' = p_id;' || E'\n'
      || '      o_handled := true;' || E'\n'
      || '      if not found then o_owner := null; end if;' || E'\n'
      || '      return;' || E'\n'
      || '    exception when others then' || E'\n'
      || '      o_handled := false; o_owner := null; return;' || E'\n'
      || '    end;' || E'\n'
      || '  end if;' || E'\n';
  end loop;

  return query
  select 'platform.partitioned_row_attrs'::text,
    'create or replace function platform.partitioned_row_attrs(' || E'\n'
    || '  p_schema text, p_table text, p_id uuid,' || E'\n'
    || '  out o_handled boolean, out o_vis platform.visibility, out o_owner uuid,' || E'\n'
    || '  out o_org uuid, out o_found boolean)' || E'\n'
    || 'returns record language plpgsql stable security definer set search_path to '''' as $probe$' || E'\n'
    || '-- GENERATED by platform.rebuild_static_row_probes() (LADDER-PERF). Do not edit by hand:' || E'\n'
    || '-- platform.static_row_probes_stale() goes red when this body no longer matches the registry.' || E'\n'
    || '-- fingerprint: ' || v_fp || E'\n'
    || 'begin' || E'\n'
    || '  o_handled := true; o_found := false;' || E'\n'
    || '  o_vis := ''personal''::platform.visibility; o_owner := null; o_org := null;' || E'\n'
    || '  if p_schema is null or p_table is null or p_id is null then o_handled := false; return; end if;' || E'\n'
    || v_a
    || '  o_handled := false;' || E'\n'
    || '  return;' || E'\n'
    || 'end;' || E'\n'
    || '$probe$;'
  union all
  select 'iam.registry_owner_of'::text,
    'create or replace function iam.registry_owner_of(' || E'\n'
    || '  p_resource_type text, p_id uuid, out o_handled boolean, out o_owner uuid)' || E'\n'
    || 'returns record language plpgsql stable security definer set search_path to '''' as $probe$' || E'\n'
    || '-- GENERATED by platform.rebuild_static_row_probes() (LADDER-PERF). Do not edit by hand:' || E'\n'
    || '-- platform.static_row_probes_stale() goes red when this body no longer matches the registry.' || E'\n'
    || '-- fingerprint: ' || v_fp || E'\n'
    || 'begin' || E'\n'
    || '  o_handled := false; o_owner := null;' || E'\n'
    || '  if p_resource_type is null or p_id is null then return; end if;' || E'\n'
    || v_o
    || '  return;' || E'\n'
    || 'end;' || E'\n'
    || '$probe$;';
end;
$fn$;


create or replace function platform.rebuild_static_row_probes()
returns integer
language plpgsql
volatile
security definer
set search_path to ''
as $fn$
declare rec record; n integer := 0;
begin
  for rec in select * from platform.static_row_probe_sql() loop
    execute rec.ddl;
    n := n + 1;
  end loop;
  execute 'revoke all on function platform.partitioned_row_attrs(text, text, uuid) from public';
  execute 'revoke all on function iam.registry_owner_of(text, uuid) from public';
  return n;
end;
$fn$;

comment on function platform.rebuild_static_row_probes() is
  'LADDER-PERF: regenerate the plan-cached probes for every PARTITIONED entity/registry table. '
  'Run it after provisioning a partitioned table; platform.static_row_probes_stale() says when.';


select platform.rebuild_static_row_probes();

-- ---------------------------------------------------------------------------------------------
-- 3. THE CENSUS — the probes are current, or this says exactly what is missing.
-- ---------------------------------------------------------------------------------------------
create or replace function platform.static_row_probes_stale()
returns table(what text, detail text, remedy text)
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  v_fp text;
  v_body text;
  rec record;
begin
  select md5(string_agg(s.kind || '|' || s.key || '|' || s.schema_name || '|' || s.table_name
                        || '|' || s.shape::text || '|' || coalesce(s.id_column, '')
                        || '|' || coalesce(s.owner_column, ''), E'\n' order by s.kind, s.key))
    into v_fp
    from platform.static_row_probe_spec() s;
  v_fp := coalesce(v_fp, md5(''));

  for rec in
    select 'platform.partitioned_row_attrs'::text as fn
    union all select 'iam.registry_owner_of'::text
  loop
    select pg_catalog.pg_get_functiondef(pr.oid) into v_body
      from pg_catalog.pg_proc pr
      join pg_catalog.pg_namespace ns on ns.oid = pr.pronamespace
     where ns.nspname || '.' || pr.proname = rec.fn;
    if v_body is null then
      return query select rec.fn,
        'the generated probe does not exist'::text,
        'select platform.rebuild_static_row_probes();'::text;
    elsif position('-- fingerprint: ' || v_fp in v_body) = 0 then
      return query select rec.fn,
        ('the generated probe was built from a different registry than the one live now '
         || '(expected fingerprint ' || v_fp || ')')::text,
        'select platform.rebuild_static_row_probes();'::text;
    end if;
  end loop;
end;
$fn$;

comment on function platform.static_row_probes_stale() is
  'LADDER-PERF: zero rows means every PARTITIONED entity/registry table has a current '
  'plan-cached probe. A row names the one that does not and how to fix it.';


-- ---------------------------------------------------------------------------------------------
-- 4. THE TWO KERNEL FUNCTIONS ASK THE GENERATED PROBE FIRST. EVERYTHING ELSE IS UNCHANGED.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION platform.entity_row_access_attrs(p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform'
AS $function$
DECLARE
  v_registry_vis platform.visibility;
  v_probe record;
BEGIN
  o_found := false;
  o_vis := 'personal'::platform.visibility;
  o_owner := NULL;
  o_org := NULL;

  IF p_schema IS NULL OR p_table IS NULL OR p_id IS NULL THEN
    RETURN;
  END IF;

  -- 🚨 LADDER-PERF (2026-09-20) — A PARTITIONED ROW IS PROBED BY A CACHED PLAN.
  -- Everything below this line is unchanged and is still the general case. What changed is
  -- that a table PostgreSQL has to plan a sixteen-way Append for is no longer planned from
  -- scratch on every call: plpgsql's EXECUTE never caches a plan, and this function is called
  -- once per node of every containment walk in iam.has_access_for_base. Measured on the main
  -- database: 0.881 ms a call for custom.record, of which 0.814 ms was planning — against
  -- 0.139 ms for the identical probe as static, plan-cached SQL. The static arms are GENERATED
  -- from platform.entity_types by platform.rebuild_static_row_probes(), they use the shape the
  -- fallbacks below would have reached, and any surprise at all hands the question straight
  -- back to them (o_handled = false).
  v_probe := platform.partitioned_row_attrs(p_schema, p_table, p_id);
  IF v_probe.o_handled THEN
    o_vis := v_probe.o_vis; o_owner := v_probe.o_owner;
    o_org := v_probe.o_org; o_found := v_probe.o_found;
    RETURN;
  END IF;

  BEGIN
    EXECUTE format(
      'SELECT visibility, created_by, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  BEGIN
    EXECUTE format(
      'SELECT visibility, owner_id, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  BEGIN
    EXECUTE format(
      'SELECT ''personal''::platform.visibility, owner_id, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  BEGIN
    EXECUTE format(
      'SELECT ''personal''::platform.visibility, created_by, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  -- Registry-declared intent for tables with no ownership columns; 'personal'
  -- remains the default when the registry declares nothing.
  SELECT et.default_visibility
    INTO v_registry_vis
  FROM platform.entity_types et
  WHERE et.schema_name = p_schema
    AND et.table_name = p_table
  LIMIT 1;

  -- No ownership columns, but the table IS org-scoped (context.scope_types,
  -- runtime plumbing, ...): surface organization_id so membership-based access
  -- can apply, with the registry's declared visibility.
  BEGIN
    EXECUTE format(
      'SELECT $2::platform.visibility, NULL::uuid, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found
    USING p_id, coalesce(v_registry_vis, 'personal'::platform.visibility);
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  -- Row exists but the table carries NO ownership columns at all — a platform
  -- catalog (ui.ui_surface, ...). There is no owner and no org to key access
  -- on, so 'personal' is meaningless here and denies everyone. Honor the
  -- registry's declared intent; 'personal' remains the default when the
  -- registry declares nothing.
  BEGIN
    EXECUTE format(
      'SELECT $2::platform.visibility, NULL::uuid, NULL::uuid, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found
    USING p_id, coalesce(v_registry_vis, 'personal'::platform.visibility);
  EXCEPTION WHEN others THEN
    o_found := false;
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION iam.owner_of(p_resource_type text, p_resource_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reg   record;
  v_probe record;
  v_owner uuid;
begin
  -- 🚨 LADDER-PERF (2026-09-20) — THE SAME CLASS, THE SAME REMEDY. `execute format(...)` below
  -- is re-planned on every call and, for a hash-partitioned table addressed by id alone, that
  -- is a sixteen-way Append planned from scratch: 0.884 ms a call on the main database against
  -- 0.180 ms through the generated, plan-cached arm. iam.effective_level asks this on every
  -- question the one ladder answers. The generated probe covers PARTITIONED registry tables
  -- only; every other resource type falls through to the body below, untouched.
  v_probe := iam.registry_owner_of(p_resource_type, p_resource_id);
  if v_probe.o_handled then
    return v_probe.o_owner;
  end if;

  select r.schema_name, r.table_name, r.id_column, r.owner_column
    into v_reg
    from platform.shareable_resource_registry r
   where r.resource_type = p_resource_type and r.is_active;
  if not found then return null; end if;
  execute format('select %I from %I.%I where %I = $1',
                 v_reg.owner_column, v_reg.schema_name, v_reg.table_name, v_reg.id_column)
    into v_owner using p_resource_id;
  return v_owner;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- THE DOOR ROWS THE SHAPE GUARD ASKS FOR. Not one of these is a client door: the generator and
-- its census read the system catalogue, and the two probes answer a row's ownership columns with
-- no access decision of their own — the access decision is the KERNEL'S, and the kernel is the
-- only caller. `signed_in_callers` and `anonymous_callers` are false on every row.
-- ---------------------------------------------------------------------------------------------
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('platform', 'static_row_probe_spec', '', ARRAY[]::oid[],
   'Takes no argument and no entity id: it reads platform.entity_types, '
   || 'platform.shareable_resource_registry and pg_class and says which of them are partitioned. '
   || 'There is nothing to check against a caller.',
   'ladderperf_a_partitioned_row_is_probed_by_a_cached_plan.sql',
   'server_only: called by platform.static_row_probe_sql, platform.static_row_probes_stale and '
   || 'scripts/campaign-tests/ladderperf_green.sql. It is a catalogue census; a client must not '
   || 'be able to enumerate the platform''s registries.',
   false, false),
  ('platform', 'static_row_probe_sql', '', ARRAY[]::oid[],
   'Takes no argument and no entity id: it renders the TEXT of the two generated probes from '
   || 'the spec. It touches no row of any organization.',
   'ladderperf_a_partitioned_row_is_probed_by_a_cached_plan.sql',
   'server_only: called by platform.rebuild_static_row_probes and read by a lane checking what '
   || 'would be generated. It emits DDL, which no client may ever be handed.',
   false, false),
  ('platform', 'rebuild_static_row_probes', '', ARRAY[]::oid[],
   'Takes no argument and no entity id. It writes the two generated probe functions and nothing '
   || 'else; it reads and changes no organization''s rows.',
   'ladderperf_a_partitioned_row_is_probed_by_a_cached_plan.sql',
   'server_only: run by a migration after a partitioned entity table is provisioned, and named '
   || 'as the remedy by platform.static_row_probes_stale. It executes DDL, so no client may call it.',
   false, false),
  ('platform', 'static_row_probes_stale', '', ARRAY[]::oid[],
   'Takes no argument and no entity id: it compares the live generated bodies against the '
   || 'registry fingerprint and returns a row per probe that is missing or out of date.',
   'ladderperf_a_partitioned_row_is_probed_by_a_cached_plan.sql',
   'server_only: census 15 of pnpm check:store-doors-decide and PART 3 of '
   || 'scripts/campaign-tests/ladderperf_green.sql. It is a catalogue question with no per-person '
   || 'answer in it.',
   false, false),
  ('platform', 'entity_row_access_attrs',
   'p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean',
   ARRAY[25, 25, 2950]::oid[],
   'p_id is deliberately NOT checked against the caller. This is the platform access kernel''s '
   || 'own row probe: its whole job is to RETURN the row''s visibility, owner and organization '
   || 'so that iam.has_access_for_base can decide with them, which is exactly why no client may '
   || 'call it. It had never been declared; the shape guard asked for the declaration when this '
   || 'lane replaced the body, and this row is the answer, not a new opening. A NULL schema, '
   || 'table or id returns o_found = false, personal, and no owner or organization.',
   'ladderperf_a_partitioned_row_is_probed_by_a_cached_plan.sql',
   'server_only: called by iam.has_access_for_base once per node of every containment walk, by '
   || 'iam.entity_read_expr and by the RLS mirror''s own helpers. It hands back ownership '
   || 'columns with no decision attached, so a client must never reach it.',
   false, false),
  ('platform', 'partitioned_row_attrs', 'p_schema text, p_table text, p_id uuid',
   ARRAY[25, 25, 2950]::oid[],
   'p_id is deliberately NOT checked against the caller, exactly as in '
   || 'platform.entity_row_access_attrs which this stands in for: it RETURNS the row''s '
   || 'visibility, owner and organization so that iam.has_access_for_base can decide with them. '
   || 'Returning those three columns to a caller who has not been decided is precisely why no '
   || 'client may call it. A NULL schema, table or id answers o_handled = false and decides '
   || 'nothing.',
   'ladderperf_a_partitioned_row_is_probed_by_a_cached_plan.sql',
   'server_only: called by platform.entity_row_access_attrs (the platform access kernel''s own '
   || 'row probe) and by scripts/campaign-tests/ladderperf_green.sql PART 4. It hands back '
   || 'ownership columns with no decision attached, so a client must never reach it.',
   false, false),
  ('iam', 'registry_owner_of', 'p_resource_type text, p_id uuid', ARRAY[25, 2950]::oid[],
   'p_id is deliberately NOT checked against the caller, exactly as in iam.owner_of which this '
   || 'stands in for: it RETURNS who owns the row so that the kernel can compare. A NULL '
   || 'resource type or id answers o_handled = false and names nobody.',
   'ladderperf_a_partitioned_row_is_probed_by_a_cached_plan.sql',
   'server_only: called by iam.owner_of, which iam.effective_level asks on every question the '
   || 'one ladder answers. It names a row''s owner with no decision attached, so a client must '
   || 'never reach it.',
   false, false);
